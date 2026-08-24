import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  CacheTTL,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiTags } from '@nestjs/swagger';

@Controller('comments')
@ApiTags('Comments Controller')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // Create a new comment (root or nested reply)
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCommentDto: CreateCommentDto, @User() user: IUser) {
    return this.commentsService.create(createCommentDto, user);
  }

  // Get root comments by company (cached 30s)
  @CacheTTL(30)
  @Get()
  findAll(@Query() qs: string) {
    return this.commentsService.findAll(qs);
  }

  // Get root comments by companyId, with pagination
  @Get('/by-company/:companyId')
  findByCompany(@Param('companyId') companyId: string, @Query() qs: string) {
    return this.commentsService.findByCompany(companyId, qs);
  }
  // Get child replies by parentId
  @Get('/parent/:parentId')
  findByParent(@Param('parentId') parentId: string, @Query() qs: string) {
    return this.commentsService.findByParent(parentId, qs);
  }

  // Delete comment + all nested replies (updates Nested Set)
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.commentsService.remove(id, user);
  }
}
