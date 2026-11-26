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
import { CvUploadValidator, MAX_CV_UPLOAD_BYTES } from './files.service';

const uploadThrottle = { default: { limit: 10, ttl: 60_000 } };

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
        .addMaxSizeValidator({ maxSize: MAX_CV_UPLOAD_BYTES })
        .addValidator(new CvUploadValidator())
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
        .addMaxSizeValidator({ maxSize: MAX_CV_UPLOAD_BYTES })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    return this.filesService.uploadImage(file);
  }
}
