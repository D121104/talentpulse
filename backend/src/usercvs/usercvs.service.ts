import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { UserCV } from './entities/usercv.entity';
import { IUser } from 'src/users/users.interface';
import { CreateUserCVDto } from './dto/create-usercv.dto';
import { UpdateUserCVDto } from './dto/update-usercv.dto';
import { CVParseStatus } from './cv-parse-status';
import { AiCvConsentsService } from 'src/ai-consents/ai-cv-consents.service';
import { UserCvParseJobData } from './cv-parse.processor';

export interface CandidateCvSnapshot {
  cvId: string;
  contentHash: string;
  title: string | null;
  target: string | null;
  skills: string[];
  education: string[];
  experience: string[];
  certificates: string[];
  sanitizedText: string;
}

@Injectable()
export class UserCVsService {
  constructor(
    @InjectRepository(UserCV)
    private readonly userCVRepo: Repository<UserCV>,
    @InjectQueue('user-cv-parse')
    private readonly cvParseQueue: Queue<UserCvParseJobData>,
    private readonly aiCvConsentsService: AiCvConsentsService,
  ) {}

  async create(createUserCVDto: CreateUserCVDto, user: IUser) {
    const url = createUserCVDto.url?.trim() || '';
    const cleanUrl = url.toLowerCase().split('?')[0].split('#')[0];
    const isOnline = Boolean(createUserCVDto.onlineCvId);

    if (!isOnline) {
      const isPdf = cleanUrl.endsWith('.pdf');
      const isDocx = cleanUrl.endsWith('.docx') || cleanUrl.endsWith('.doc');
      if (!isPdf && !isDocx) {
        throw new BadRequestException(
          'Chỉ chấp nhận file PDF hoặc DOCX. Vui lòng tải lên đúng định dạng.',
        );
      }
    }

    const existingCVs = await this.userCVRepo.count({
      where: { userId: user._id, isDeleted: false },
    });
    const isPrimary = existingCVs === 0 || createUserCVDto.isPrimary === true;

    if (isPrimary) {
      await this.userCVRepo.update(
        { userId: user._id, isPrimary: true },
        { isPrimary: false },
      );
    }

    const onlineText = [
      createUserCVDto.description,
      ...(createUserCVDto.skills || []),
      ...(createUserCVDto.education || []),
      ...(createUserCVDto.experience || []),
      ...(createUserCVDto.certificates || []),
    ]
      .filter(Boolean)
      .join('\n');
    const onlineReady = isOnline;
    const newCV = this.userCVRepo.create({
      url,
      title: createUserCVDto.title,
      description: createUserCVDto.description,
      onlineCvId: createUserCVDto.onlineCvId,
      fileType: isOnline ? 'online' : cleanUrl.endsWith('.pdf') ? 'pdf' : 'docx',
      skills: isOnline ? createUserCVDto.skills || [] : [],
      education: isOnline ? createUserCVDto.education || [] : [],
      experience: isOnline ? createUserCVDto.experience || [] : [],
      certificates: isOnline ? createUserCVDto.certificates || [] : [],
      parsedText: onlineReady ? onlineText : null,
      parseStatus: onlineReady ? CVParseStatus.READY : CVParseStatus.PENDING,
      parsedAt: onlineReady ? new Date() : null,
      contentHash: onlineReady
        ? createHash('sha256').update(onlineText, 'utf8').digest('hex')
        : null,
      userId: user._id,
      isPrimary,
      createdBy: { _id: user._id, email: user.email },
    });

    const savedCV = await this.userCVRepo.save(newCV);
    if (!isOnline) {
      await this.enqueueParse(savedCV._id, url);
    }

    return {
      _id: savedCV._id,
      url: savedCV.url,
      title: savedCV.title,
      isPrimary: savedCV.isPrimary,
      fileType: savedCV.fileType,
      parseStatus: savedCV.parseStatus,
      createdAt: savedCV.createdAt,
    };
  }

  private async enqueueParse(cvId: string, fileUrl: string): Promise<void> {
    try {
      await this.cvParseQueue.add(
        'parse-cv',
        { cvId, fileUrl },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch {
      await this.userCVRepo.update(cvId, {
        parseStatus: CVParseStatus.FAILED,
        parseErrorCode: 'QUEUE_ENQUEUE_FAILED',
      });
    }
  }

  async createAiSnapshot(
    userId: string,
    cvId: string,
    scope: string,
    consentVersion: string,
    policyHash: string,
  ): Promise<CandidateCvSnapshot> {
    const cv = await this.userCVRepo.findOne({
      where: { _id: cvId, userId, isDeleted: false },
    });
    if (!cv) {
      throw new NotFoundException('CV không tồn tại hoặc không thuộc về bạn');
    }
    if (cv.parseStatus !== CVParseStatus.READY || !cv.contentHash) {
      throw new ConflictException('CV chưa sẵn sàng để xử lý AI');
    }
    if (
      !(await this.aiCvConsentsService.hasValidConsent(
        userId,
        scope,
        consentVersion,
        policyHash,
      ))
    ) {
      throw new BadRequestException('Chưa có consent hợp lệ cho mục đích AI này');
    }

    return {
      cvId: cv._id,
      contentHash: cv.contentHash,
      title: cv.title || null,
      target: null,
      skills: [...(cv.skills || [])],
      education: [...(cv.education || [])],
      experience: [...(cv.experience || [])],
      certificates: [...(cv.certificates || [])],
      sanitizedText: (cv.parsedText || '').slice(0, 12000),
    };
  }

  async findByOnlineCvId(onlineCvId: string, user: IUser) {
    return this.userCVRepo.findOne({
      where: { onlineCvId, userId: user._id, isDeleted: false },
    });
  }

  async findByUser(user: IUser) {
    return this.userCVRepo.find({
      where: { userId: user._id, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async getCVsForApplication(user: IUser) {
    return this.findByUser(user);
  }

  async findOne(id: string, user: IUser) {
    const cv = await this.userCVRepo.findOne({
      where: { _id: id, userId: user._id, isDeleted: false },
    });
    if (!cv) {
      throw new NotFoundException('CV không tồn tại hoặc không thuộc về bạn');
    }
    return cv;
  }

  async update(id: string, updateUserCVDto: UpdateUserCVDto, user: IUser) {
    const cv = await this.findOne(id, user);
    if (updateUserCVDto.isPrimary === true) {
      await this.userCVRepo.update(
        { userId: user._id, isPrimary: true },
        { isPrimary: false },
      );
    }
    await this.userCVRepo.update(id, {
      title: updateUserCVDto.title,
      description: updateUserCVDto.description,
      isPrimary: updateUserCVDto.isPrimary,
      updatedBy: { _id: user._id, email: user.email },
    });
    return this.userCVRepo.findOne({ where: { _id: cv._id } });
  }

  async setPrimary(id: string, user: IUser) {
    await this.findOne(id, user);
    await this.userCVRepo.update(
      { userId: user._id, isPrimary: true },
      { isPrimary: false },
    );
    await this.userCVRepo.update(id, {
      isPrimary: true,
      updatedBy: { _id: user._id, email: user.email },
    });
    return { message: 'Đã đặt làm CV chính' };
  }

  // Toggle allow recruiter to search this CV
  async toggleSearchable(id: string, user: IUser, isSearchable?: boolean) {
    const cv = await this.findOne(id, user);
    const newSearchable = isSearchable !== undefined ? Boolean(isSearchable) : !cv.isSearchable;

    await this.userCVRepo.update(id, {
      isSearchable: newSearchable,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return {
      _id: cv._id,
      isSearchable: newSearchable,
      message: newSearchable
        ? 'Đã bật cho phép Nhà Tuyển Dụng tìm kiếm CV này'
        : 'Đã tắt cho phép Nhà Tuyển Dụng tìm kiếm CV này',
    };
  }

  async remove(id: string, user: IUser) {
    const cv = await this.findOne(id, user);
    await this.userCVRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: { _id: user._id, email: user.email },
    });
    const result = await this.userCVRepo.softDelete(id);
    if (cv.isPrimary) {
      const nextCV = await this.userCVRepo.findOne({
        where: { userId: user._id, isDeleted: false },
        order: { createdAt: 'DESC' },
      });
      if (nextCV) await this.userCVRepo.update(nextCV._id, { isPrimary: true });
    }
    return result;
  }

  async getPrimaryCV(userId: string) {
    return this.userCVRepo.findOne({
      where: { userId, isPrimary: true, isDeleted: false },
    });
  }

  async countByUser(userId: string) {
    return this.userCVRepo.count({ where: { userId, isDeleted: false } });
  }

  async findByUserId(userId: string) {
    return this.userCVRepo.find({
      where: { userId, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }
}
