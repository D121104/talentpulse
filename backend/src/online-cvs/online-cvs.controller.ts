import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OnlineCVsService } from './online-cvs.service';
import { CreateOnlineCVDto } from './dto/create-online-cv.dto';
import { UpdateOnlineCVDto } from './dto/update-online-cv.dto';
import {
  GenerateOnlineCvDto,
  EnqueueOnlineCvGenerationDto,
} from './dto/generate-online-cv.dto';
import { GenerateFromCareerProfileDto } from 'src/candidate-career-profile/dto/update-candidate-career-profile.dto';
import { User, ResponseMessage } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@Controller('online-cvs')
@ApiTags('Online CVs Controller')
export class OnlineCVsController {
  constructor(private readonly onlineCVsService: OnlineCVsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new online CV' })
  @ApiBearerAuth()
  @ResponseMessage('Tạo CV online thành công')
  create(@Body() createOnlineCVDto: CreateOnlineCVDto, @User() user: IUser) {
    return this.onlineCVsService.create(createOnlineCVDto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate-from-career-profile')
  @Post('generate-from-profile')
  @ApiOperation({
    summary: 'Generate a new editable AI CV from the career profile',
  })
  @ApiBearerAuth()
  @ResponseMessage('Tạo bản nháp CV mới từ hồ sơ nghề nghiệp thành công')
  generateFromProfile(
    @Body() dto: GenerateFromCareerProfileDto,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.generateFromCareerProfile(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/generation-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue editable AI CV generation' })
  @ApiBearerAuth()
  enqueueGeneration(
    @Param('id') id: string,
    @Body() dto: EnqueueOnlineCvGenerationDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.enqueueGeneration(
      id,
      dto,
      user,
      idempotencyKey,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('generation-jobs/from-career-profile')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue editable AI CV generation from career profile',
  })
  @ApiBearerAuth()
  enqueueGenerationFromCareerProfile(
    @Body() dto: GenerateFromCareerProfileDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.enqueueGenerationFromCareerProfile(
      dto,
      user,
      idempotencyKey,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/generation-jobs/:operationId')
  @ApiOperation({ summary: 'Get asynchronous CV generation status' })
  @ApiBearerAuth()
  getGenerationJob(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('operationId', new ParseUUIDPipe()) operationId: string,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.getGenerationJob(id, operationId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/generation-jobs/:operationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel asynchronous CV generation' })
  @ApiBearerAuth()
  cancelGeneration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('operationId', new ParseUUIDPipe()) operationId: string,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.cancelGeneration(id, operationId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/generate')
  @ApiOperation({ summary: 'Generate an editable AI CV draft' })
  @ApiBearerAuth()
  @ResponseMessage('Tạo bản nháp CV bằng AI thành công')
  generate(
    @Param('id') id: string,
    @Body() dto: GenerateOnlineCvDto,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.generate(id, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all online CVs of current user' })
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách CV online')
  findAll(@User() user: IUser) {
    return this.onlineCVsService.findByUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get online CV by ID' })
  @ApiBearerAuth()
  @ResponseMessage('Lấy chi tiết CV online')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.onlineCVsService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/preview')
  @ApiOperation({ summary: 'Get preview HTML of online CV' })
  @ApiBearerAuth()
  @ResponseMessage('Lấy xem trước CV')
  getPreview(@Param('id') id: string, @User() user: IUser) {
    return this.onlineCVsService.getPreviewHTML(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/set-primary')
  @ApiOperation({ summary: 'Set an online CV as primary' })
  @ApiBearerAuth()
  @ResponseMessage('Đặt CV chính thành công')
  setPrimary(@Param('id') id: string, @User() user: IUser) {
    return this.onlineCVsService.setPrimary(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/searchable')
  @ApiOperation({ summary: 'Toggle recruiter search permission for online CV' })
  @ApiBearerAuth()
  @ResponseMessage('Cập nhật trạng thái cho phép NTD tìm kiếm thành công')
  toggleSearchable(
    @Param('id') id: string,
    @Body('isSearchable') isSearchable: boolean,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.toggleSearchable(id, user, isSearchable);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update online CV' })
  @ApiBearerAuth()
  @ResponseMessage('Cập nhật CV online thành công')
  update(
    @Param('id') id: string,
    @Body() updateOnlineCVDto: UpdateOnlineCVDto,
    @User() user: IUser,
  ) {
    return this.onlineCVsService.update(id, updateOnlineCVDto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/export')
  @ApiOperation({ summary: 'Export online CV to PDF' })
  @ApiBearerAuth()
  @ResponseMessage('Xuất CV thành PDF')
  exportToPdf(
    @Param('id') id: string,
    @Body() body: { htmlContent?: string; isPremium?: boolean },
    @User() user: IUser,
  ) {
    return this.onlineCVsService.exportToPdf(
      id,
      user,
      body?.htmlContent,
      body?.isPremium,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete online CV' })
  @ApiBearerAuth()
  @ResponseMessage('Xóa CV online thành công')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.onlineCVsService.remove(id, user);
  }
}
