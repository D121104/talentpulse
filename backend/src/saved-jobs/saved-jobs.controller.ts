import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SavedJobsService } from './saved-jobs.service';
import { ToggleSavedJobDto } from './dto/toggle-saved-job.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { User, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';

@ApiTags('Saved Jobs Controller')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-jobs')
export class SavedJobsController {
  constructor(private readonly savedJobsService: SavedJobsService) {}

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle save / unsave a job' })
  @ResponseMessage('Cập nhật trạng thái lưu việc làm')
  toggleSavedJob(@Body() dto: ToggleSavedJobDto, @User() user: IUser) {
    return this.savedJobsService.toggleSavedJob(user._id, dto.jobId);
  }

  @Get()
  @ApiOperation({ summary: 'Get list of saved jobs with full details and pagination' })
  @ResponseMessage('Lấy danh sách việc làm đã lưu thành công')
  getMySavedJobs(
    @Query('current') current: number,
    @Query('pageSize') pageSize: number,
    @User() user: IUser,
  ) {
    return this.savedJobsService.getMySavedJobs(user._id, current, pageSize);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Get list of saved job IDs for quick heart checking' })
  @ResponseMessage('Lấy danh sách ID việc làm đã lưu')
  getMySavedJobIds(@User() user: IUser) {
    return this.savedJobsService.getMySavedJobIds(user._id);
  }

  @Delete(':jobId')
  @ApiOperation({ summary: 'Remove a job from saved list' })
  @ResponseMessage('Xóa việc làm khỏi danh sách đã lưu')
  removeSavedJob(@Param('jobId') jobId: string, @User() user: IUser) {
    return this.savedJobsService.removeSavedJob(user._id, jobId);
  }
}
