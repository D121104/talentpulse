import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Role, Roles, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { CandidateAssistantService } from './candidate-assistant.service';
import { CreateAiChatSessionDto } from './dto/create-ai-chat-session.dto';
import {
  ListAiChatMessagesDto,
  SendAiChatMessageDto,
} from './dto/send-ai-chat-message.dto';
@Controller('ai/candidate-assistant')
@ApiTags('Candidate Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
export class CandidateAssistantController {
  constructor(private readonly service: CandidateAssistantService) {}
  @Post('sessions') create(
    @Body() dto: CreateAiChatSessionDto,
    @User() user: IUser,
  ) {
    return this.service.createSession(dto, user);
  }
  @Get('sessions') list(@User() user: IUser) {
    return this.service.listSessions(user);
  }
  @Patch('sessions/:id/archive') archive(
    @Param('id') id: string,
    @User() user: IUser,
  ) {
    return this.service.archiveSession(id, user);
  }
  @Get('sessions/:id/messages') messages(
    @Param('id') id: string,
    @Query() dto: ListAiChatMessagesDto,
    @User() user: IUser,
  ) {
    return this.service.listMessages(id, dto, user);
  }
  @Post('sessions/:id/messages') send(
    @Param('id') id: string,
    @Body() dto: SendAiChatMessageDto,
    @User() user: IUser,
  ) {
    return this.service.sendMessage(id, dto, user);
  }
}
