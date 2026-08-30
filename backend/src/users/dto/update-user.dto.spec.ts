import { validate } from 'class-validator';
import { UpdateUserPasswordDto } from './update-user.dto';

describe('UpdateUserPasswordDto', () => {
  it('validates the existing currentPassword/newPassword request contract', async () => {
    const dto = Object.assign(new UpdateUserPasswordDto(), {
      currentPassword: 'current-password',
      newPassword: 'new-password',
      password: 'new-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects non-string and too-short passwords', async () => {
    const dto = Object.assign(new UpdateUserPasswordDto(), {
      currentPassword: 12345678,
      newPassword: 'short',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['currentPassword', 'newPassword']),
    );
  });

  it('rejects passwords longer than the maximum', async () => {
    const dto = Object.assign(new UpdateUserPasswordDto(), {
      currentPassword: 'a'.repeat(129),
      newPassword: 'b'.repeat(129),
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['currentPassword', 'newPassword']),
    );
  });

  it('requires a current password and a new password through supported aliases', async () => {
    const errors = await validate(new UpdateUserPasswordDto());

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['currentPassword', 'newPassword']),
    );
  });
});
