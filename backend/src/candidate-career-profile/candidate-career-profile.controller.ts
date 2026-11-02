import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ResponseMessage, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { UpdateCandidateCareerProfileDto } from './dto/update-candidate-career-profile.dto';
import { CandidateCareerProfileService } from './candidate-career-profile.service';

@Controller('candidate-career-profile')
@ApiTags('Candidate Career Profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CandidateCareerProfileController {
  constructor(private readonly profileService: CandidateCareerProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated candidate career profile' })
  @ResponseMessage('Lấy hồ sơ nghề nghiệp ứng viên')
  getMine(@User() user: IUser) {
    return this.profileService.getMine(user);
  }

  @Put('me')
  @ApiOperation({
    summary: 'Replace the authenticated candidate career profile',
  })
  @ResponseMessage('Cập nhật hồ sơ nghề nghiệp ứng viên thành công')
  updateMine(
    @Body() dto: UpdateCandidateCareerProfileDto,
    @User() user: IUser,
  ) {
    return this.profileService.updateMine(dto, user);
  }
}
