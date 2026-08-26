import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserCV } from './entities/usercv.entity';
import { IUser } from 'src/users/users.interface';
import { CreateUserCVDto } from './dto/create-usercv.dto';
import { UpdateUserCVDto } from './dto/update-usercv.dto';
import { AIMatchingService } from 'src/ai-matching/ai-matching.service';

@Injectable()
export class UserCVsService {
  private readonly logger = new Logger(UserCVsService.name);

  constructor(
    @InjectRepository(UserCV)
    private readonly userCVRepo: Repository<UserCV>,
    private readonly aiMatchingService: AIMatchingService,
  ) {}

  // Upload a new CV
  async create(createUserCVDto: CreateUserCVDto, user: IUser) {
    const url = createUserCVDto.url?.toLowerCase() || '';
    const cleanUrl = url.split('?')[0].split('#')[0];
    const isOnline = !!createUserCVDto.onlineCvId;

    if (!isOnline) {
      const isPdf = cleanUrl.endsWith('.pdf');
      const isDocx = cleanUrl.endsWith('.docx') || cleanUrl.endsWith('.doc');

      if (!isPdf && !isDocx) {
        throw new BadRequestException(
          'Chỉ chấp nhận file PDF hoặc DOCX. Vui lòng tải lên đúng định dạng.',
        );
      }

      createUserCVDto.fileType = isPdf ? 'pdf' : 'docx';
    } else {
      createUserCVDto.fileType = 'online';
    }

    const existingCVs = await this.userCVRepo.count({
      where: {
        userId: user._id,
        isDeleted: false,
      },
    });

    const isPrimary = existingCVs === 0 || createUserCVDto.isPrimary === true;

    if (isPrimary) {
      await this.userCVRepo.update(
        { userId: user._id, isPrimary: true },
        { isPrimary: false },
      );
    }

    const newCV = this.userCVRepo.create({
      ...createUserCVDto,
      userId: user._id,
      isPrimary,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedCV = await this.userCVRepo.save(newCV);

    // For uploaded files, parse text and extract keywords asynchronously
    if (!isOnline && createUserCVDto.url) {
      this.parseAndExtractCVData(savedCV._id, createUserCVDto.url);
    }

    return {
      _id: savedCV._id,
      url: savedCV.url,
      title: savedCV.title,
      isPrimary: savedCV.isPrimary,
      fileType: savedCV.fileType,
      createdAt: savedCV.createdAt,
    };
  }

  /**
   * Parse uploaded file and extract keywords (skills, education, experience, certificates)
   * Runs asynchronously after CV creation
   */
  private async parseAndExtractCVData(cvId: string, fileUrl: string) {
    try {
      this.logger.log(`Parsing CV file: ${cvId} from ${fileUrl}`);

      const parsedText = await this.aiMatchingService.extractTextFromFile(
        fileUrl,
      );

      const sections =
        parsedText.length >= 10
          ? this.aiMatchingService.extractSectionsFromText(parsedText)
          : { skills: [], education: [], experience: [], certificates: [] };

      await this.userCVRepo.update(cvId, {
        parsedText: parsedText || undefined,
        skills: sections.skills,
        education: sections.education,
        experience: sections.experience,
        certificates: sections.certificates,
      });

      this.logger.log(
        `CV parsed successfully: ${cvId}, skills=${sections.skills.length}`,
      );
    } catch (error) {
      this.logger.error(`Failed to parse CV ${cvId}:`, error);
    }
  }

  // Find UserCV by onlineCvId reference
  async findByOnlineCvId(onlineCvId: string, user: IUser) {
    return await this.userCVRepo.findOne({
      where: {
        onlineCvId,
        userId: user._id,
        isDeleted: false,
      },
    });
  }

  // Get all CVs of current user (primary first)
  async findByUser(user: IUser) {
    return await this.userCVRepo.find({
      where: { userId: user._id, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  // Get CVs for job application form (primary first)
  async getCVsForApplication(user: IUser) {
    return await this.userCVRepo.find({
      where: { userId: user._id, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  // Get one CV by ID
  async findOne(id: string, user: IUser) {
    const cv = await this.userCVRepo.findOne({
      where: {
        _id: id,
        userId: user._id,
        isDeleted: false,
      },
    });

    if (!cv) {
      throw new NotFoundException('CV không tồn tại hoặc không thuộc về bạn');
    }

    return cv;
  }

  // Update CV info (title, description)
  async update(id: string, updateUserCVDto: UpdateUserCVDto, user: IUser) {
    const cv = await this.userCVRepo.findOne({
      where: {
        _id: id,
        userId: user._id,
        isDeleted: false,
      },
    });

    if (!cv) {
      throw new BadRequestException('CV không tồn tại hoặc không thuộc về bạn');
    }

    if (updateUserCVDto.isPrimary === true) {
      await this.userCVRepo.update(
        { userId: user._id, isPrimary: true },
        { isPrimary: false },
      );
    }

    await this.userCVRepo.update(id, {
      ...updateUserCVDto,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return await this.userCVRepo.findOne({ where: { _id: id } });
  }

  // Set a CV as primary
  async setPrimary(id: string, user: IUser) {
    const cv = await this.userCVRepo.findOne({
      where: {
        _id: id,
        userId: user._id,
        isDeleted: false,
      },
    });

    if (!cv) {
      throw new BadRequestException('CV không tồn tại hoặc không thuộc về bạn');
    }

    await this.userCVRepo.update(
      { userId: user._id, isPrimary: true },
      { isPrimary: false },
    );

    await this.userCVRepo.update(id, {
      isPrimary: true,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
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

  // Delete a CV
  async remove(id: string, user: IUser) {
    const cv = await this.userCVRepo.findOne({
      where: {
        _id: id,
        userId: user._id,
        isDeleted: false,
      },
    });

    if (!cv) {
      throw new BadRequestException('CV không tồn tại hoặc không thuộc về bạn');
    }

    await this.userCVRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const result = await this.userCVRepo.softDelete(id);

    // If deleted CV was primary, set the next CV as primary
    if (cv.isPrimary) {
      const nextCV = await this.userCVRepo.findOne({
        where: { userId: user._id, isDeleted: false },
        order: { createdAt: 'DESC' },
      });

      if (nextCV) {
        await this.userCVRepo.update(nextCV._id, { isPrimary: true });
      }
    }

    return result;
  }

  // Get primary CV of a user
  async getPrimaryCV(userId: string) {
    return await this.userCVRepo.findOne({
      where: {
        userId,
        isPrimary: true,
        isDeleted: false,
      },
    });
  }

  // Count CVs by user
  async countByUser(userId: string) {
    return await this.userCVRepo.count({
      where: {
        userId,
        isDeleted: false,
      },
    });
  }

  // Get all CVs of a specific user (Admin only)
  async findByUserId(userId: string) {
    return await this.userCVRepo.find({
      where: { userId, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }
}
