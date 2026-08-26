import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { User, Roles, Role } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiTags } from '@nestjs/swagger';
import { RolesGuard } from 'src/guards/roles.guard';

@Controller('jobs')
@ApiTags('Jobs Controller')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  @Post()
  create(@Body() createJobDto: CreateJobDto, @User() user: IUser) {
    return this.jobsService.create(createJobDto, user);
  }

  @Get()
  findAll(@Query() qs: string) {
    return this.jobsService.findAll(qs);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
    @User() user: IUser,
  ) {
    return this.jobsService.update(id, updateJobDto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id/boost')
  boostJob(@Param('id') id: string, @User() user: IUser) {
    return this.jobsService.boostJob(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Delete(':id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.jobsService.remove(id, user);
  }

  @Get('/record/count')
  countJobs() {
    return this.jobsService.countJobs();
  }

  @Get('/by-hr/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  getJobsByHr(@User() user: IUser, @Query() qs: string) {
    return this.jobsService.getJobsByHr(user, qs);
  }

  @Get('/by-hr/search')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  searchJobsByHr(
    @User() user: IUser,
    @Query('name') name: string,
    @Query() qs: string,
  ) {
    return this.jobsService.searchJobsByHr(user, name, qs);
  }
}
