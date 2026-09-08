import { MAX_CV_UPLOAD_BYTES, validateCvUpload } from './files.service';

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
