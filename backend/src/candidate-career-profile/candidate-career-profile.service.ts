import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { IUser } from 'src/users/users.interface';
import { Role } from 'src/decorator/customize';
import {
  CandidateCareerProfile,
  CandidateCareerContact,
} from './entities/candidate-career-profile.entity';
import { UpdateCandidateCareerProfileDto } from './dto/update-candidate-career-profile.dto';
import { filterMeaningfulCvEntries } from 'src/core/cv-entry-filter';

@Injectable()
export class CandidateCareerProfileService {
  constructor(
    @InjectRepository(CandidateCareerProfile)
    private readonly profileRepo: Repository<CandidateCareerProfile>,
  ) {}

  async getMine(user: IUser): Promise<Record<string, unknown>> {
    this.assertCandidate(user);
    const profile = await this.findMineEntity(user);
    return profile ? this.toResponse(profile) : this.emptyResponse(user);
  }

  async requireMine(user: IUser): Promise<CandidateCareerProfile> {
    this.assertCandidate(user);
    const profile = await this.findMineEntity(user);
    if (!profile) {
      throw new NotFoundException('Chưa có hồ sơ nghề nghiệp ứng viên');
    }
    return profile;
  }

  async updateMine(
    dto: UpdateCandidateCareerProfileDto,
    user: IUser,
  ): Promise<Record<string, unknown>> {
    this.assertCandidate(user);
    const current = await this.findMineEntity(user);
    const expectedVersion = dto.contentVersion;
    if (current && current.contentVersion !== expectedVersion) {
      throw new ConflictException(
        'Hồ sơ nghề nghiệp đã được thay đổi; vui lòng tải lại trước khi lưu',
      );
    }
    if (!current && expectedVersion !== 0) {
      throw new ConflictException(
        'Phiên bản hồ sơ nghề nghiệp không hợp lệ; vui lòng tải lại',
      );
    }

    const normalized = this.normalize(dto, user);
    if (!current) {
      try {
        const created = await this.profileRepo.save(
          this.profileRepo.create({
            userId: user._id,
            ...normalized,
            contentVersion: 1,
          }),
        );
        return this.toResponse(created);
      } catch (error) {
        if (error instanceof QueryFailedError) {
          throw new ConflictException(
            'Hồ sơ nghề nghiệp đã được tạo; vui lòng tải lại trước khi lưu',
          );
        }
        throw error;
      }
    }

    const nextVersion = current.contentVersion + 1;
    const result = await this.profileRepo.update(
      { _id: current._id, userId: user._id, contentVersion: expectedVersion },
      { ...normalized, contentVersion: nextVersion },
    );
    if (!result.affected) {
      throw new ConflictException(
        'Hồ sơ nghề nghiệp đã được thay đổi; vui lòng tải lại trước khi lưu',
      );
    }
    const saved = await this.profileRepo.findOneOrFail({
      where: { _id: current._id, userId: user._id },
    });
    return this.toResponse(saved);
  }

  private async findMineEntity(
    user: IUser,
  ): Promise<CandidateCareerProfile | null> {
    return this.profileRepo.findOne({ where: { userId: user._id } });
  }

  private emptyResponse(user: IUser): Record<string, unknown> {
    return {
      contentVersion: 0,
      fullName: user.name || '',
      email: user.email || '',
      phone: '',
      link: '',
      address: user.address || '',
      avatar: user.avatar || '',
      headline: '',
      careerObjective: '',
      experience: [],
      education: [],
      projects: [],
      certificates: [],
      skills: [],
      activities: [],
      awards: [],
    };
  }

  private toResponse(profile: CandidateCareerProfile): Record<string, unknown> {
    const contact: CandidateCareerContact =
      profile.contact || ({} as CandidateCareerContact);
    return {
      _id: profile._id,
      contentVersion: profile.contentVersion,
      fullName: contact.fullName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      link: contact.link || '',
      address: contact.address || '',
      avatar: contact.avatar || '',
      headline: profile.headline || '',
      objective: profile.objective || '',
      careerObjective: profile.objective || '',
      experience: profile.experience || [],
      education: profile.education || [],
      projects: profile.projects || [],
      certificates: profile.certificates || [],
      skills: profile.skills || [],
      activities: profile.activities || [],
      awards: profile.awards || [],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private assertCandidate(user: IUser): void {
    if (user.role !== Role.USER) {
      throw new ForbiddenException(
        'Chỉ ứng viên mới được quản lý hồ sơ nghề nghiệp',
      );
    }
  }

  private normalize(dto: UpdateCandidateCareerProfileDto, user: IUser) {
    const inputContact = dto.contact || {};
    const contact: CandidateCareerContact = {
      fullName:
        this.text(dto.fullName) ||
        this.text(inputContact.fullName) ||
        this.text(user.name) ||
        null,
      email:
        this.text(dto.email) ||
        this.text(inputContact.email) ||
        this.text(user.email) ||
        null,
      phone: this.text(dto.phone) || this.text(inputContact.phone),
      link: this.text(dto.link) || this.text(inputContact.link),
      address:
        this.text(dto.address) ||
        this.text(inputContact.address) ||
        this.text(user.address),
      avatar:
        this.text(dto.avatar) ||
        this.text(inputContact.avatar) ||
        user.avatar ||
        null,
    };
    return {
      contact,
      headline: this.text(dto.headline),
      objective: this.text(dto.objective ?? dto.careerObjective),
      experience: filterMeaningfulCvEntries(
        (dto.experience || []).map((entry) => ({
          companyName: this.text(entry.companyName),
          position: this.text(entry.position),
          startDate: this.text(entry.startDate),
          endDate: this.text(entry.endDate),
          description: this.text(entry.description),
        })),
      ),
      education: filterMeaningfulCvEntries(
        (dto.education || []).map((entry) => ({
          schoolName: this.text(entry.schoolName),
          degree: this.text(entry.degree),
          major: this.text(entry.major),
          startDate: this.text(entry.startDate),
          endDate: this.text(entry.endDate),
          description: this.text(entry.description),
        })),
      ),
      projects: filterMeaningfulCvEntries(
        (dto.projects || []).map((entry) => ({
          projectName: this.text(entry.projectName),
          role: this.text(entry.role),
          startDate: this.text(entry.startDate),
          endDate: this.text(entry.endDate),
          description: this.text(entry.description),
          technologies: (entry.technologies || '')
            .split(',')
            .map((technology) => this.text(technology))
            .filter((technology): technology is string => Boolean(technology)),
        })),
      ),
      certificates: filterMeaningfulCvEntries(
        (dto.certificates || []).map((entry) => ({
          name: this.text(entry.name),
          issuer: this.text(entry.issuer),
          date: this.text(entry.date),
          credentialUrl: this.text(entry.credentialUrl),
        })),
      ),
      skills: filterMeaningfulCvEntries(
        (dto.skills || []).map((entry) => ({
          name: this.text(entry.name),
          level: this.text(entry.level),
          description: this.text(entry.description),
        })),
      ),
      activities: filterMeaningfulCvEntries(
        (dto.activities || []).map((entry) => ({
          organizationName: this.text(entry.organizationName),
          position: this.text(entry.position),
          startDate: this.text(entry.startDate),
          endDate: this.text(entry.endDate),
          description: this.text(entry.description),
        })),
      ),
      awards: filterMeaningfulCvEntries(
        (dto.awards || []).map((entry) => ({
          name: this.text(entry.name),
          issuer: this.text(entry.issuer),
          date: this.text(entry.date),
          description: this.text(entry.description),
        })),
      ),
    };
  }

  private text(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized || null;
  }
}
