import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiTags } from '@nestjs/swagger';

@Controller('subscribers')
@ApiTags('Subscribers Controller')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  // Create or update job notification subscription
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createSubscriberDto: CreateSubscriberDto,
    @User() user: IUser,
  ) {
    return this.subscribersService.createOrUpdate(createSubscriberDto, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateSubscriberDto: UpdateSubscriberDto,
    @User() user: IUser,
  ) {
    return this.subscribersService.update(id, updateSubscriberDto, user);
  }

  // Get current user's subscription info
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMySubscription(@User() user: IUser) {
    return this.subscribersService.getSubscriberByUserId(user._id);
  }

  @Get('email')
  @UseGuards(JwtAuthGuard)
  async getByEmail(@User() user: IUser) {
    return this.subscribersService.getSubscriberByEmail(user.email);
  }

  // Toggle subscription active/inactive
  @Patch('toggle-active/:id')
  @UseGuards(JwtAuthGuard)
  toggleActive(@Param('id') id: string, @User() user: IUser) {
    return this.subscribersService.toggleActive(id, user);
  }

  // Delete subscription (soft delete)
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.subscribersService.remove(id, user);
  }
}
