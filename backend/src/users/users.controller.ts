import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RegisterUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserPasswordDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IUser } from './users.interface';
import { User, Roles, Role } from 'src/decorator/customize';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from 'src/guards/roles.guard';

@Controller('users')
@ApiTags('User Controller')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create user (Admin only)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Create user successfully' })
  @Post()
  create(@Body() registerUserDto: RegisterUserDto) {
    return this.usersService.create(registerUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get users list (Admin/HR only)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Get users list successfully' })
  @ApiQuery({
    name: 'current',
    required: false,
    description: 'Current page number',
    example: 1,
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Number of items per page',
    example: 10,
  })
  @Get()
  findAll(@Query() qs: string, @User() user: IUser) {
    return this.usersService.findAll(qs, user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user by id' })
  @ApiBearerAuth()
  @Get(':id')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user information' })
  @ApiBearerAuth()
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @User() user: IUser,
  ) {
    const isAdmin = user.role === Role.ADMIN;

    // Role and company assignment are administrative changes, not self-service fields.
    if (
      !isAdmin &&
      Object.prototype.hasOwnProperty.call(updateUserDto, 'role')
    ) {
      throw new BadRequestException('Only admins can change user roles');
    }
    if (
      !isAdmin &&
      Object.prototype.hasOwnProperty.call(updateUserDto, 'company')
    ) {
      throw new BadRequestException(
        'Only admins can change user company assignments',
      );
    }

    // Admin can update any user; other users can only update themselves.
    const targetId = isAdmin ? id : user._id;
    return this.usersService.update(targetId, updateUserDto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete user by id (Admin only)' })
  @ApiBearerAuth()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user password' })
  @ApiBearerAuth()
  @Post('/change-password')
  updatePassword(
    @User() user: IUser,
    @Body() updateUserDto: UpdateUserPasswordDto,
  ) {
    return this.usersService.updatePassword(user._id, updateUserDto);
  }

  @ApiOperation({ summary: 'Count users record' })
  @Get('/record/count')
  countUser() {
    return this.usersService.countUser();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @ApiOperation({ summary: 'Remove HR from company (Admin/HR only)' })
  @ApiBearerAuth()
  @Post('/hrs/remove-from-company')
  removeHrFromCompany(
    @Body() body: { hrId: string; companyId: string },
    @User() user: IUser,
  ) {
    return this.usersService.removeHrFromCompany(
      body.hrId,
      body.companyId,
      user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  @ApiOperation({ summary: 'Leave company (for non-creator HRs)' })
  @ApiBearerAuth()
  @Post('/leave-company')
  leaveCompany(@User() user: IUser) {
    return this.usersService.leaveCompany(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lock user account (Admin only)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lock user successfully' })
  @Post(':id/lock')
  lockUser(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @User() user: IUser,
  ) {
    return this.usersService.lockUser(id, body.reason, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Unlock user account (Admin only)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Unlock user successfully' })
  @Post(':id/unlock')
  unlockUser(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.unlockUser(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all candidates - USER role only (Admin only)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Get candidates list successfully' })
  @ApiQuery({
    name: 'current',
    required: false,
    description: 'Current page number',
    example: 1,
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Number of items per page',
    example: 10,
  })
  @Get('/admin/candidates')
  findAllCandidates(@Query() qs: string, @User() user: IUser) {
    return this.usersService.findAllCandidates(qs, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve HR account (Admin only)' })
  @ApiBearerAuth()
  @Post(':id/approve-hr')
  approveHr(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.approveHr(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get pending HR accounts (Admin only)' })
  @ApiBearerAuth()
  @Get('/admin/pending-hrs')
  findPendingHrs(@User() user: IUser) {
    return this.usersService.findPendingHrs(user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Boost candidate profile to the top of HR CV search',
  })
  @ApiBearerAuth()
  @Post('/candidate/boost-profile')
  boostProfile(@User() user: IUser) {
    return this.usersService.boostProfile(user._id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get candidate profile boost status & cooldown' })
  @ApiBearerAuth()
  @Get('/candidate/boost-status')
  getBoostStatus(@User() user: IUser) {
    return this.usersService.getBoostStatus(user._id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get candidate job seeking & visibility settings' })
  @ApiBearerAuth()
  @Get('/candidate/settings')
  getCandidateSettings(@User() user: IUser) {
    return this.usersService.getCandidateSettings(user._id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update candidate job seeking & visibility settings',
  })
  @ApiBearerAuth()
  @Patch('/candidate/settings')
  updateCandidateSettings(
    @Body()
    settings: {
      isJobSeeking?: boolean;
      isJobRecommendation?: boolean;
      allowRecruiterSearch?: boolean;
    },
    @User() user: IUser,
  ) {
    return this.usersService.updateCandidateSettings(user._id, settings);
  }
}
