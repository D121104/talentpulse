import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

@Injectable()
export class FilesService {
  uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
    return new Promise<{ url: string }>((resolve, reject) => {
      // Determine resource type based on file mimetype
      const isPdf = file.mimetype === 'application/pdf';
      const isDocx =
        file.mimetype ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.mimetype === 'application/msword';
      const isRawFile = isPdf || isDocx;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: isRawFile ? 'raw' : 'image',
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
