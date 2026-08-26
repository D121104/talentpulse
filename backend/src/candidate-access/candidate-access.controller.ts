import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CandidateAccessService } from './candidate-access.service';
import { SearchCandidatesDto } from './dto/search-candidate.dto';
import { UnlockCandidateDto } from './dto/unlock-candidate.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles, Role, User, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';

@ApiTags('HR Candidate Search & Access Controller')
@ApiBearerAuth()
@Controller('hr/candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HR, Role.ADMIN)
export class CandidateAccessController {
  constructor(
    private readonly candidateAccessService: CandidateAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Search candidates public profile (No sensitive contact info/cvUrl in response)',
  })
  @ResponseMessage('Tìm kiếm hồ sơ ứng viên thành công')
  searchCandidates(
    @Query() dto: SearchCandidatesDto,
    @User() user: IUser,
  ) {
    return this.candidateAccessService.searchCandidates(dto, user);
  }

  @Get('quota')
  @ApiOperation({ summary: 'Get current HR daily unlock quota status (UTC+7)' })
  @ResponseMessage('Lấy thông tin hạn mức mở khóa CV thành công')
  getQuota(@User() user: IUser) {
    return this.candidateAccessService.getDailyQuota(user);
  }

  @Get('my-unlocks')
  @ApiOperation({ summary: 'Get list of candidates unlocked by current HR' })
  @ResponseMessage('Lấy lịch sử mở khóa CV thành công')
  getMyUnlocks(
    @Query('current') current: number,
    @Query('pageSize') pageSize: number,
    @User() user: IUser,
  ) {
    return this.candidateAccessService.getMyUnlocks(user, current, pageSize);
  }

  @Post(':candidateUserId/unlock')
  @ApiOperation({
    summary:
      'Unlock candidate contact info and CV download/preview (Deducts 1 credit if not premium and not unlocked)',
  })
  @ResponseMessage('Xử lý mở khóa hồ sơ ứng viên')
  unlockCandidate(
    @Param('candidateUserId') candidateUserId: string,
    @Body() dto: UnlockCandidateDto,
    @User() user: IUser,
  ) {
    return this.candidateAccessService.unlockCandidate(
      candidateUserId,
      dto,
      user,
    );
  }
}

@ApiTags('Candidate Profile Viewers Controller')
@ApiBearerAuth()
@Controller('candidate/employer-views')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
export class CandidateViewsController {
  constructor(
    private readonly candidateAccessService: CandidateAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get list of employers who have unlocked and viewed candidate CV',
  })
  @ResponseMessage('Lấy danh sách nhà tuyển dụng đã xem CV thành công')
  getEmployerViews(
    @Query('current') current: number,
    @Query('pageSize') pageSize: number,
    @User() user: IUser,
  ) {
    return this.candidateAccessService.getCandidateEmployerViews(
      user,
      current,
      pageSize,
    );
  }
}
