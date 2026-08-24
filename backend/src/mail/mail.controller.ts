import { Controller, Get, Post, UseGuards, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles, Role, ResponseMessage } from 'src/decorator/customize';
import { RolesGuard } from 'src/guards/roles.guard';

@Controller('mail')
@ApiTags('Mail Controller')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('/send-interview-invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  @ResponseMessage('Send interview invite email')
  async sendInterviewInvite(
    @Body() body: { email: string; subject: string; content: string },
  ) {
    // Send email asynchronously, return response immediately
    this.mailService.sendInterviewInvite(
      body.email,
      body.subject,
      body.content,
    );
    return { message: 'Interview invite is being sent' };
  }
}
