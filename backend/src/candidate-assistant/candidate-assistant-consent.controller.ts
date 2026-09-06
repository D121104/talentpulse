import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Role, Roles, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import {
  GrantCandidateAssistantConsentDto,
  RevokeCandidateAssistantConsentDto,
} from './dto/candidate-assistant-consent.dto';
import { CandidateAssistantConsentService } from './candidate-assistant-consent.service';
@Controller('ai/candidate-assistant/consent')
@ApiTags('Candidate Assistant Consent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
export class CandidateAssistantConsentController {
  constructor(private readonly service: CandidateAssistantConsentService) {}
  @Post('grant') grant(
    @Body() dto: GrantCandidateAssistantConsentDto,
    @User() user: IUser,
  ) {
    return this.service.grant(user._id, dto);
  }
  @Post('revoke') revoke(
    @Body() dto: RevokeCandidateAssistantConsentDto,
    @User() user: IUser,
  ) {
    return this.service.revoke(user._id, dto);
  }
  @Get('current') current(@User() user: IUser) {
    return this.service.getCurrent(user._id);
  }
}
