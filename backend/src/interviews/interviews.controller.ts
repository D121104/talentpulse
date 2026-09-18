import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InterviewsService } from './interviews.service';
import { CreateInterviewRoundDto } from './dto/create-interview-round.dto';
import { UpdateInterviewRoundDto } from './dto/update-interview-round.dto';
import {
  ConfirmInterviewDto,
  InterviewFilterDto,
  SendInterviewInviteDto,
} from './dto/confirm-interview.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles, Role, User, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';

@ApiTags('Interviews')
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  // HR schedules a new interview round
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Post()
  @ResponseMessage('Lên lịch phỏng vấn thành công')
  create(
    @Body() createDto: CreateInterviewRoundDto,
    @User() user: IUser,
  ) {
    return this.interviewsService.create(createDto, user);
  }

  // Get Calendar matrix for company HR
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Get('calendar')
  @ResponseMessage('Lấy dữ liệu lịch phỏng vấn thành công')
  getCalendar(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @User() user: IUser,
  ) {
    const companyId = user.company?._id || '';
    return this.interviewsService.getCalendarMatrix(companyId, startDate, endDate);
  }

  // Get interview room details by roomId
  @UseGuards(JwtAuthGuard)
  @Get('room/:roomId')
  @ResponseMessage('Thông tin phòng phỏng vấn')
  getRoom(@Param('roomId') roomId: string, @User() user: IUser) {
    return this.interviewsService.findByRoomId(roomId, user);
  }

  // HR ends meeting room immediately for all participants
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Post('room/:roomId/end')
  @ResponseMessage('Đã kết thúc buổi phỏng vấn')
  endMeeting(@Param('roomId') roomId: string, @User() user: IUser) {
    return this.interviewsService.endMeetingByRoomId(roomId, user);
  }

  // Candidate confirms or declines interview
  @UseGuards(JwtAuthGuard)
  @Post(':id/confirm')
  @ResponseMessage('Cập nhật trạng thái xác nhận phỏng vấn thành công')
  confirm(
    @Param('id') id: string,
    @Body() confirmDto: ConfirmInterviewDto,
    @User() user: IUser,
  ) {
    return this.interviewsService.confirm(id, confirmDto, user);
  }

  // HR sends online room invite when interview starts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Post(':id/send-online-invite')
  @ResponseMessage('Đã gửi lời mời tham gia phòng phỏng vấn tới ứng viên')
  sendOnlineInvite(
    @Param('id') id: string,
    @Body() inviteDto: SendInterviewInviteDto,
    @User() user: IUser,
  ) {
    return this.interviewsService.sendOnlineInvite(id, inviteDto, user);
  }

  // Filter and list interviews
  @UseGuards(JwtAuthGuard)
  @Get()
  @ResponseMessage('Danh sách lịch phỏng vấn')
  findAll(@Query() filter: InterviewFilterDto, @User() user: IUser) {
    return this.interviewsService.findAll(filter, user);
  }

  // Get interview round by ID
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ResponseMessage('Chi tiết lịch phỏng vấn')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.interviewsService.findOne(id, user);
  }

  // Update interview round
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id')
  @ResponseMessage('Cập nhật lịch phỏng vấn thành công')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateInterviewRoundDto,
    @User() user: IUser,
  ) {
    return this.interviewsService.update(id, updateDto, user);
  }
}
