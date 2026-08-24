import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application.dto';
import { User, Roles, Role, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { ApiTags } from '@nestjs/swagger';

@Controller('applications')
@ApiTags('Applications Controller')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // Submit a job application + queue AI matching
  @UseGuards(JwtAuthGuard)
  @Post()
  @ResponseMessage('Nộp đơn ứng tuyển thành công')
  create(
    @Body() createApplicationDto: CreateApplicationDto,
    @User() user: IUser,
  ) {
    return this.applicationsService.create(createApplicationDto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Get()
  @ResponseMessage('Lấy danh sách đơn ứng tuyển')
  findAll(@Query() qs: any, @User() user: IUser) {
    return this.applicationsService.findAll(qs, user);
  }

  // Get current user's submitted applications
  @UseGuards(JwtAuthGuard)
  @Get('my-applications')
  @ResponseMessage('Lấy danh sách đơn ứng tuyển của tôi')
  findByUser(@User() user: IUser) {
    return this.applicationsService.findByUser(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Get('by-job/:jobId')
  @ResponseMessage('Lấy danh sách đơn ứng tuyển theo công việc')
  findByJob(
    @Param('jobId') jobId: string,
    @Query() qs: any,
    @User() user: IUser,
  ) {
    return this.applicationsService.findByJob(jobId, qs, user);
  }

  // Search candidates by CV content (skills, education, address)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Get('by-job/:jobId/search-cv')
  @ResponseMessage('Tìm kiếm ứng viên theo CV')
  searchByCV(
    @Param('jobId') jobId: string,
    @Query('skills') skills: string,
    @Query('education') education: string,
    @Query('address') address: string,
    @Query('certificates') certificates: string,
    @User() user: IUser,
  ) {
    return this.applicationsService.searchByCV(
      jobId,
      { skills, education, address, certificates },
      user,
    );
  }

  // Get AI-ranked candidates by match score
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Get('by-job/:jobId/ai-rank')
  @ResponseMessage('Xếp hạng ứng viên bằng AI')
  getAIRankedCandidates(
    @Param('jobId') jobId: string,
    @Query('topN') topN: string,
    @User() user: IUser,
  ) {
    const limit = topN ? parseInt(topN, 10) : 10;
    return this.applicationsService.getAIRankedCandidates(jobId, limit, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ResponseMessage('Lấy chi tiết đơn ứng tuyển')
  findOne(@Param('id') id: string) {
    return this.applicationsService.findOne(id);
  }

  // HR updates application status -> sends notification to candidate
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id/status')
  @ResponseMessage('Cập nhật trạng thái đơn ứng tuyển')
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateApplicationStatusDto,
    @User() user: IUser,
  ) {
    return this.applicationsService.updateStatus(id, updateDto, user);
  }

  // Withdraw application (soft delete + remove AI match result)
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ResponseMessage('Hủy đơn ứng tuyển thành công')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.applicationsService.remove(id, user);
  }
}
