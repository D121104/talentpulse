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
import { OnlineCVsService } from './online-cvs.service';
import { CreateOnlineCVDto } from './dto/create-online-cv.dto';
import { UpdateOnlineCVDto } from './dto/update-online-cv.dto';
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
  @ApiOperation({ summary: 'Export online CV to PDF and save to user CVs' })
  @ApiBearerAuth()
  @ResponseMessage('Xuất CV thành PDF')
  exportToPdf(@Param('id') id: string, @User() user: IUser) {
    return this.onlineCVsService.exportToPdf(id, user);
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
