import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

const uploadThrottle = { default: { limit: 10, ttl: 60_000 } };
const maxUploadSize = 5 * 1024 * 1024;

@Controller('files')
@ApiTags('Files Controller')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Throttle(uploadThrottle)
  @UseInterceptors(FileInterceptor('fileUpload'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(pdf|msword|officedocument\.wordprocessingml|docx)$/,
        })
        .addMaxSizeValidator({ maxSize: maxUploadSize })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    return this.filesService.uploadFile(file);
  }

  @Post('upload-image')
  @Throttle(uploadThrottle)
  @UseInterceptors(FileInterceptor('fileUpload'))
  uploadImage(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(jpg|jpeg|png|gif|webp|bmp|svg\+xml)$/,
        })
        .addMaxSizeValidator({ maxSize: maxUploadSize })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    return this.filesService.uploadImage(file);
  }
}
