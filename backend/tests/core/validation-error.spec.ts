import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateCandidateCareerProfileDto } from 'src/candidate-career-profile/dto/update-candidate-career-profile.dto';
import { createValidationException } from 'src/core/validation-error';

describe('global validation error response', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: createValidationException,
  });

  it('keeps server-owned fields forbidden without exposing class-validator internals', async () => {
    let exception: BadRequestException | undefined;
    try {
      await pipe.transform(
        {
          _id: 'server-owned-id',
          createdAt: 'server-owned-date',
          contentVersion: 1,
        },
        { type: 'body', metatype: UpdateCandidateCareerProfileDto },
      );
    } catch (error) {
      exception = error as BadRequestException;
    }

    if (!exception) throw new Error('Expected validation to fail');
    const response = exception.getResponse();
    expect(response).toMatchObject({
      message: 'Dữ liệu gửi lên không hợp lệ',
      errors: [
        { field: '_id', messages: ['Trường này không được phép cập nhật'] },
        {
          field: 'createdAt',
          messages: ['Trường này không được phép cập nhật'],
        },
      ],
    });
    expect(JSON.stringify(response)).not.toContain('should not exist');
    expect(JSON.stringify(response)).not.toContain('property _id');
  });

  it('returns safe Vietnamese field errors for missing and invalid values', async () => {
    await expect(
      pipe.transform(
        { contentVersion: 'not-a-number' },
        { type: 'body', metatype: UpdateCandidateCareerProfileDto },
      ),
    ).rejects.toMatchObject({
      response: {
        errors: [
          {
            field: 'contentVersion',
            messages: expect.arrayContaining(['Giá trị phải là số nguyên']),
          },
        ],
      },
    });

    await expect(
      pipe.transform(
        {},
        { type: 'body', metatype: UpdateCandidateCareerProfileDto },
      ),
    ).rejects.toMatchObject({
      response: {
        errors: [
          {
            field: 'contentVersion',
            messages: ['Phiên bản hồ sơ là bắt buộc'],
          },
        ],
      },
    });
  });
});
