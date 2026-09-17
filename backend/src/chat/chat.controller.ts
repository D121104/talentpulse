import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { StartConversationDto, AddReactionDto } from './dto/start-conversation.dto';

@ApiTags('Chat & Realtime Messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Khởi tạo hoặc lấy phòng chat giữa ứng viên và công ty đã nộp hồ sơ' })
  startConversation(
    @User() user: IUser,
    @Body() dto: StartConversationDto,
  ) {
    return this.chatService.getOrCreateConversation(user, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Lấy danh sách các cuộc trò chuyện của người dùng' })
  getConversations(
    @User() user: IUser,
    @Query('search') search?: string,
  ) {
    return this.chatService.getConversations(user, search);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Lấy chi tiết một cuộc trò chuyện' })
  getConversationById(
    @User() user: IUser,
    @Param('id') id: string,
  ) {
    return this.chatService.getConversationById(user, id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Lấy danh sách tin nhắn trong cuộc trò chuyện' })
  getMessages(
    @User() user: IUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.chatService.getMessages(user, id, pageNum, limitNum);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn mới vào cuộc trò chuyện' })
  sendMessage(
    @User() user: IUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.chatService.sendMessage(user, id, dto);
  }

  @Put('conversations/:id/read')
  @ApiOperation({ summary: 'Đánh dấu tất cả tin nhắn trong phòng là đã đọc' })
  markAsRead(
    @User() user: IUser,
    @Param('id') id: string,
  ) {
    return this.chatService.markAsRead(user, id);
  }

  @Post('messages/:id/reaction')
  @ApiOperation({ summary: 'Thả hoặc gỡ biểu cảm (reaction) cho tin nhắn' })
  addReaction(
    @User() user: IUser,
    @Param('id') messageId: string,
    @Body('emoji') emoji: string,
  ) {
    return this.chatService.addReaction(user, messageId, emoji || '👍');
  }

  @Get('applied-partners')
  @ApiOperation({ summary: 'Lấy danh sách công ty đã ứng tuyển (Ứng viên) hoặc ứng viên đã ứng tuyển (HR)' })
  getAppliedPartners(
    @User() user: IUser,
    @Query('search') search?: string,
  ) {
    return this.chatService.getAppliedPartners(user, search);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Lấy tổng số tin nhắn chưa đọc của người dùng' })
  getUnreadCount(@User() user: IUser) {
    return this.chatService.getUnreadCount(user);
  }
}
