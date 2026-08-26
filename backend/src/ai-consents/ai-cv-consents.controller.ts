import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IUser } from 'src/users/users.interface';
import { User } from 'src/decorator/customize';
import { GrantAiCvConsentDto, RevokeAiCvConsentDto } from './dto/ai-cv-consent.dto';
import { AiCvConsentsService } from './ai-cv-consents.service';

@Controller('ai/cv-consents')
@ApiTags('AI CV Consent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class AiCvConsentsController {
  constructor(private readonly consentsService: AiCvConsentsService) {}

  @Post('grant')
  grant(@Body() dto: GrantAiCvConsentDto, @User() user: IUser) {
    return this.consentsService.grant(user._id, dto);
  }

  @Post('revoke')
  revoke(@Body() dto: RevokeAiCvConsentDto, @User() user: IUser) {
    return this.consentsService.revoke(user._id, dto);
  }

  @Get(':scope')
  current(@Param('scope') scope: string, @User() user: IUser) {
    return this.consentsService.getCurrent(user._id, scope);
  }
}
