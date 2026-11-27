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
  Req,
  BadRequestException,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { User, Roles, Role, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiTags } from '@nestjs/swagger';
import { RolesGuard } from 'src/guards/roles.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { requiredSecret } from 'src/auth/required-secret';

@Controller('jobs')
@ApiTags('Jobs Controller')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private extractOptionalUser(req: any): IUser | undefined {
    if (req.user) {
      return req.user;
    }
    const authHeader = req.headers?.authorization;
    if (typeof authHeader !== 'string') {
      return undefined;
    }
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match) {
      return undefined;
    }
    try {
      return this.jwtService.verify<IUser>(match[1], {
        secret: requiredSecret(this.configService, 'JWT_SECRET'),
      });
    } catch {
      return undefined;
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  @Post()
  create(@Body() createJobDto: CreateJobDto, @User() user: IUser) {
    return this.jobsService.create(createJobDto, user);
  }

  @Get('landing-popular')
  async getLandingPopular(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    const user = this.extractOptionalUser(req);
    return this.jobsService.getLandingPopularJobs({
      user,
      page: Number(page) || 1,
      limit: Number(limit) || 9,
    });
  }

  @Get('search-es')
  searchElasticsearch(
    @Query('query') query?: string,
    @Query('location') location?: string,
    @Query('skills') skills?: string,
    @Query('level') level?: string,
    @Query('minSalary') minSalary?: string,
    @Query('maxSalary') maxSalary?: string,
    @Query('negotiable') negotiable?: string,
    @Query('isHot') isHot?: string,
    @Query('isFeatured') isFeatured?: string,
    @Query('isUrgent') isUrgent?: string,
    @Query('companyId') companyId?: string,
    @Query('sort') sort?: 'relevance' | 'newest' | 'salary_desc' | 'salary_asc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedSkills = skills
      ? skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return this.jobsService.searchJobsFromElasticsearch({
      query,
      location,
      skills: parsedSkills,
      level,
      minSalary: minSalary ? Number(minSalary) : undefined,
      maxSalary: maxSalary ? Number(maxSalary) : undefined,
      negotiable: negotiable !== undefined ? negotiable === 'true' : undefined,
      isHot: isHot !== undefined ? isHot === 'true' : undefined,
      isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
      isUrgent: isUrgent !== undefined ? isUrgent === 'true' : undefined,
      companyId,
      sort,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('map-search')
  @ResponseMessage('Tìm kiếm việc làm theo vị trí địa lý')
  searchJobsByMap(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
    @Query('radius') radius: string,
    @Query('query') query: string,
    @Query('level') level: string,
    @Query('workingModel') workingModel: string,
    @Query('minSalary') minSalary: string,
    @Query('maxSalary') maxSalary: string,
    @Query('negotiable') negotiable: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @User() user: IUser,
  ) {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    const parsedRadius = parseFloat(radius) || 10;

    if (
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLon) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLon < -180 ||
      parsedLon > 180
    ) {
      throw new BadRequestException('Tọa độ lat và lon không hợp lệ');
    }

    return this.jobsService.searchJobsByLocation(
      {
        lat: parsedLat,
        lon: parsedLon,
        radiusKm: parsedRadius,
        query: query?.trim(),
        level: level?.trim() || undefined,
        workingModel: workingModel?.trim() || undefined,
        minSalary: minSalary ? Number(minSalary) : undefined,
        maxSalary: maxSalary ? Number(maxSalary) : undefined,
        negotiable: negotiable !== undefined ? negotiable === 'true' : undefined,
        page: Number(page) || 1,
        limit: Number(limit) || 30,
      },
      user,
    );
  }

  @Get('search-suggestions')
  getSearchSuggestions(
    @Query('query') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.getSearchSuggestions(
      query || '',
      limit ? Number(limit) : 8,
    );
  }

  @Get(':id/related')
  getRelatedJobs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.jobsService.getRelatedJobs(id, limit ? Number(limit) : 6);
  }

  @Get()
  findAll(@Query() qs: string) {
    return this.jobsService.findAll(qs);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Get(':id/applicant-count-status')
  @ResponseMessage('Lấy thông tin số lượng ứng viên và hạn mức xem')
  async getApplicantCountStatus(@Param('id') id: string, @Req() req: any) {
    const user = this.extractOptionalUser(req);
    return this.jobsService.getApplicantCountStatus(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unlock-applicant-count')
  @ResponseMessage('Mở khóa xem số lượng người ứng tuyển')
  unlockApplicantCount(@Param('id') id: string, @User() user: IUser) {
    return this.jobsService.unlockApplicantCount(id, user);
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
  @Patch(':id/unboost')
  unboostJob(@Param('id') id: string, @User() user: IUser) {
    return this.jobsService.unboostJob(id, user);
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
