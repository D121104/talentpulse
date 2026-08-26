import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IUser } from 'src/users/users.interface';
import { Role, Roles, User } from 'src/decorator/customize';
import { RolesGuard } from 'src/guards/roles.guard';
import { GrantAiCvConsentDto, RevokeAiCvConsentDto } from './dto/ai-cv-consent.dto';
import { AiCvConsentsService } from './ai-cv-consents.service';

@Controller('ai/cv-consents')
@ApiTags('AI CV Consent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
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

  @Get('current')
  current(@User() user: IUser) {
    return this.consentsService.getCurrentForActiveScope(user._id);
  }

  @Get('current/:scope')
  currentByScope(@Param('scope') scope: string, @User() user: IUser) {
    return this.consentsService.getCurrent(user._id, scope);
  }

  // Backwards-compatible alias for clients that already use /:scope.
  @Get(':scope')
  currentLegacy(@Param('scope') scope: string, @User() user: IUser) {
    return this.consentsService.getCurrent(user._id, scope);
  }
}
