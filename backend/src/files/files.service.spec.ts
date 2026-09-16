import { PassThrough } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import {
  FilesService,
  MAX_CV_UPLOAD_BYTES,
  validateCvUpload,
} from './files.service';

jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: jest.fn(),
    },
  },
}));

const uploadStreamMock = cloudinary.uploader.upload_stream as jest.Mock;

beforeEach(() => {
  uploadStreamMock.mockReset();
  uploadStreamMock.mockImplementation((_options, callback) => {
    const stream = new PassThrough();
    process.nextTick(() =>
      callback(null, { secure_url: 'https://cdn.test/cv.pdf' }),
    );
    return stream;
  });
});

describe('validateCvUpload', () => {
  it('accepts a PDF with PDF magic bytes', () => {
    expect(
      validateCvUpload({
        mimetype: 'application/pdf',
        size: 8,
        buffer: Buffer.from('%PDF-1.7'),
      } as Express.Multer.File),
    ).toBe(true);
  });

  it('accepts a DOCX with ZIP magic bytes', () => {
    expect(
      validateCvUpload({
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 4,
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      } as Express.Multer.File),
    ).toBe(true);
  });

  it('rejects renamed, legacy DOC and oversized uploads', () => {
    expect(
      validateCvUpload({
        mimetype: 'application/pdf',
        size: 9,
        buffer: Buffer.from('not a pdf'),
      } as Express.Multer.File),
    ).toBe(false);
    expect(
      validateCvUpload({
        mimetype: 'application/msword',
        size: 4,
        buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
      } as Express.Multer.File),
    ).toBe(false);
    expect(
      validateCvUpload({
        mimetype: 'application/pdf',
        size: MAX_CV_UPLOAD_BYTES + 1,
        buffer: Buffer.from('%PDF-1.7'),
      } as Express.Multer.File),
    ).toBe(false);
  });
});

describe('FilesService.uploadFile', () => {
  it('returns the secure URL from an explicitly public raw upload', async () => {
    const service = new FilesService();
    const file = {
      mimetype: 'application/pdf',
      size: 8,
      buffer: Buffer.from('%PDF-1.7'),
    } as Express.Multer.File;

    await expect(service.uploadFile(file)).resolves.toEqual({
      url: 'https://cdn.test/cv.pdf',
    });
    expect(uploadStreamMock).toHaveBeenCalledWith(
      {
        resource_type: 'raw',
        type: 'upload',
        folder: 'user-cvs',
        format: 'pdf',
      },
      expect.any(Function),
    );
  });
});

describe('FilesService.uploadBuffer', () => {
  it('uses public raw delivery for generated PDFs', async () => {
    const service = new FilesService();

    await expect(
      service.uploadBuffer(
        Buffer.from('%PDF-1.7'),
        'generated.pdf',
        'application/pdf',
      ),
    ).resolves.toEqual({ url: 'https://cdn.test/cv.pdf' });

    expect(uploadStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_type: 'raw',
        type: 'upload',
        format: 'pdf',
      }),
      expect.any(Function),
    );
  });
});
