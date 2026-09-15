import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedJob } from './entities/saved-job.entity';
import { Job } from 'src/jobs/entities/job.entity';

@Injectable()
export class SavedJobsService {
  constructor(
    @InjectRepository(SavedJob)
    private readonly savedJobRepo: Repository<SavedJob>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  /**
   * Toggle save / unsave a job for the authenticated candidate
   */
  async toggleSavedJob(userId: string, jobId: string) {
    if (!jobId) {
      throw new BadRequestException('jobId không được để trống');
    }

    const job = await this.jobRepo.findOne({
      where: { _id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Không tìm thấy việc làm này');
    }

    const existing = await this.savedJobRepo.findOne({
      where: { userId, jobId },
    });

    if (existing) {
      await this.savedJobRepo.delete({ _id: existing._id });
      return {
        isSaved: false,
        message: 'Đã bỏ lưu việc làm',
        jobId,
      };
    }

    const newSaved = this.savedJobRepo.create({
      userId,
      jobId,
    });
    await this.savedJobRepo.save(newSaved);

    return {
      isSaved: true,
      message: 'Đã lưu việc làm thành công',
      jobId,
    };
  }

  /**
   * Get list of saved jobs for current user with pagination
   */
  async getMySavedJobs(
    userId: string,
    current = 1,
    pageSize = 10,
  ) {
    const page = Math.max(1, Number(current) || 1);
    const limit = Math.max(1, Number(pageSize) || 10);
    const skip = (page - 1) * limit;

    const [items, total] = await this.savedJobRepo.findAndCount({
      where: { userId },
      relations: ['job'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const jobs = items
      .filter((item) => item.job && item.job.isActive !== false)
      .map((item) => ({
        ...item.job,
        savedAt: item.createdAt,
        isSaved: true,
      }));

    return {
      meta: {
        current: page,
        pageSize: limit,
        pages: Math.ceil(total / limit),
        total,
      },
      result: jobs,
    };
  }

  /**
   * Get all saved job IDs for current user (for fast heart status check)
   */
  async getMySavedJobIds(userId: string): Promise<string[]> {
    const items = await this.savedJobRepo.find({
      where: { userId },
      select: ['jobId'],
    });
    return items.map((item) => item.jobId);
  }

  /**
   * Remove a saved job by jobId
   */
  async removeSavedJob(userId: string, jobId: string) {
    const result = await this.savedJobRepo.delete({ userId, jobId });
    if (result.affected === 0) {
      throw new NotFoundException('Không tìm thấy việc làm đã lưu để xóa');
    }
    return {
      isSaved: false,
      message: 'Đã xóa việc làm khỏi danh sách đã lưu',
      jobId,
    };
  }
}
