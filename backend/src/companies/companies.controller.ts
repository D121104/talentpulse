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
  CacheTTL,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IUser } from 'src/users/users.interface';
import { User, Roles, Role } from 'src/decorator/customize';
import { FollowCompanyDto } from './dto/follow-company.dto';
import { ApiTags } from '@nestjs/swagger';
import { RolesGuard } from 'src/guards/roles.guard';

@Controller('companies')
@ApiTags('Companies Controller')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto, @User() user: IUser) {
    return this.companiesService.create(createCompanyDto, user);
  }

  @CacheTTL(60)
  @Get()
  findAll(@Query() query: string) {
    return this.companiesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @User() user: IUser,
  ) {
    return this.companiesService.update(id, updateCompanyDto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.companiesService.remove(id, user);
  }

  // Follow a company + send notification to all HRs
  @UseGuards(JwtAuthGuard)
  @Post('/follow')
  followCompany(@Body() body: FollowCompanyDto, @User() user: IUser) {
    return this.companiesService.followCompany(body, user);
  }

  // Unfollow a company
  @UseGuards(JwtAuthGuard)
  @Post('/unfollow')
  unfollowCompany(@Body() body: FollowCompanyDto, @User() user: IUser) {
    return this.companiesService.unfollowCompany(body, user);
  }

  @Get('/record/count')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  countCompanies() {
    return this.companiesService.countCompanies();
  }

  @Post('/verify/:companyId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  verifyCompany(@Param('companyId') companyId: string) {
    return this.companiesService.verifyCompany(companyId);
  }

  @Get('/by-admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  getAllByAdmin(@Query() qs: any) {
    return this.companiesService.getAllByAdmin(qs);
  }

  @Get(':id/hrs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HR)
  getCompanyHrs(@Param('id') id: string) {
    return this.companiesService.getCompanyHrs(id);
  }

  @Post('hr/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  createCompanyByHr(
    @Body() createCompanyDto: CreateCompanyDto,
    @User() user: IUser,
  ) {
    return this.companiesService.createCompanyByHr(createCompanyDto, user);
  }

  @Post(':id/request-join')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  requestJoinCompany(@Param('id') id: string, @User() user: IUser) {
    return this.companiesService.requestJoinCompany(id, user);
  }

  @Post(':id/approve-hr/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  approveHrRequest(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @User() user: IUser,
  ) {
    return this.companiesService.approveHrRequest(id, userId, user);
  }

  @Post(':id/reject-hr/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR)
  rejectHrRequest(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @User() user: IUser,
  ) {
    return this.companiesService.rejectHrRequest(id, userId, user);
  }

  @Get(':id/pending-hrs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR, Role.ADMIN)
  getPendingHrs(@Param('id') id: string) {
    return this.companiesService.getPendingHrs(id);
  }

  @Get(':id/is-creator')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HR, Role.ADMIN)
  isCompanyCreator(@Param('id') id: string, @User() user: IUser) {
    return this.companiesService.isCompanyCreator(id, user._id.toString());
  }
}
