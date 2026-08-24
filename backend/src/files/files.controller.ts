import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/decorator/customize';

@Controller('files')
@ApiTags('Files Controller')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Public()
  @UseInterceptors(FileInterceptor('fileUpload'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(pdf|msword|officedocument\.wordprocessingml|docx)$/,
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024, // 5MB
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    Logger.log(
      `Uploading CV file: ${file.originalname}, size: ${file.size} bytes, mime: ${file.mimetype}`,
    );
    return this.filesService.uploadFile(file);
  }

  @Post('upload-image')
  @Public()
  @UseInterceptors(FileInterceptor('fileUpload'))
  uploadImage(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(jpg|jpeg|png|gif|webp|bmp|svg\+xml)$/,
        })
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024, // 5MB
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    Logger.log(
      `Uploading image: ${file.originalname}, size: ${file.size} bytes, mime: ${file.mimetype}`,
    );
    return this.filesService.uploadImage(file);
  }
}
