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
import { UserCVsService } from './usercvs.service';
import { CreateUserCVDto } from './dto/create-usercv.dto';
import { UpdateUserCVDto } from './dto/update-usercv.dto';
import { User, Roles, Role, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesGuard } from 'src/guards/roles.guard';

@Controller('user-cvs')
@ApiTags('User CVs Controller')
export class UserCVsController {
  constructor(private readonly userCVsService: UserCVsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('')
  @ResponseMessage('Upload CV thành công')
  create(@Body() createUserCVDto: CreateUserCVDto, @User() user: IUser) {
    return this.userCVsService.create(createUserCVDto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ResponseMessage('Lấy danh sách CV')
  findAll(@User() user: IUser) {
    return this.userCVsService.findByUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('for-application')
  @ResponseMessage('Lấy danh sách CV cho form ứng tuyển')
  getCVsForApplication(@User() user: IUser) {
    return this.userCVsService.getCVsForApplication(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ResponseMessage('Lấy chi tiết CV')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.userCVsService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ResponseMessage('Cập nhật CV thành công')
  update(
    @Param('id') id: string,
    @Body() updateUserCVDto: UpdateUserCVDto,
    @User() user: IUser,
  ) {
    return this.userCVsService.update(id, updateUserCVDto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/set-primary')
  @ResponseMessage('Đặt CV chính thành công')
  setPrimary(@Param('id') id: string, @User() user: IUser) {
    return this.userCVsService.setPrimary(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ResponseMessage('Xóa CV thành công')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.userCVsService.remove(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/user/:userId')
  @ApiOperation({ summary: 'Get all CVs of a specific user (Admin only)' })
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách CV của người dùng')
  findByUserId(@Param('userId') userId: string) {
    return this.userCVsService.findByUserId(userId);
  }
}
