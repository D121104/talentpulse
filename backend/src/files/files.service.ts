import { BadRequestException, FileValidator, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

export const MAX_CV_UPLOAD_BYTES = 5 * 1024 * 1024;

const PDF_MIME_TYPE = 'application/pdf';
const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function validateCvUpload(file: Express.Multer.File): boolean {
  if (
    !file ||
    !Number.isInteger(file.size) ||
    file.size > MAX_CV_UPLOAD_BYTES ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length > MAX_CV_UPLOAD_BYTES
  ) {
    return false;
  }

  if (file.mimetype === PDF_MIME_TYPE) {
    return file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  return (
    file.mimetype === DOCX_MIME_TYPE &&
    file.buffer.length >= 4 &&
    file.buffer[0] === 0x50 &&
    file.buffer[1] === 0x4b &&
    file.buffer[2] === 0x03 &&
    file.buffer[3] === 0x04
  );
}

export class CvUploadValidator extends FileValidator<Record<string, never>> {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    return Boolean(file && validateCvUpload(file));
  }

  buildErrorMessage(): string {
    return 'Chỉ chấp nhận file PDF hoặc DOCX hợp lệ.';
  }
}

@Injectable()
export class FilesService {
  async uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
    if (!validateCvUpload(file)) {
      throw new BadRequestException('Chỉ chấp nhận file PDF hoặc DOCX hợp lệ.');
    }

    return new Promise<{ url: string }>((resolve, reject) => {
      const isPdf = file.mimetype === PDF_MIME_TYPE;
      const isDocx = file.mimetype === DOCX_MIME_TYPE;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          // The parser and the existing CV preview contract consume secure_url
          // directly, so keep raw CV delivery explicitly public.
          type: 'upload',
          folder: 'user-cvs',
          format: isPdf ? 'pdf' : isDocx ? 'docx' : undefined,
        },
        async (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url || result.url,
          });
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  uploadImage(file: Express.Multer.File): Promise<{ url: string }> {
    return new Promise<{ url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'images',
        },
        async (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url || result.url,
          });
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  // Upload buffer directly (for PDF generation)
  uploadBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ url: string }> {
    return new Promise<{ url: string }>((resolve, reject) => {
      const isPdf = mimeType === 'application/pdf';

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: isPdf ? 'raw' : 'image',
          type: isPdf ? 'upload' : undefined,
          folder: 'user-cvs',
          public_id: filename.replace(/\.[^/.]+$/, ''), // Remove extension
          format: isPdf ? 'pdf' : undefined,
        },
        async (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url || result.url,
          });
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}
