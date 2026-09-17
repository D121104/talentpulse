import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendAiChatMessageDto } from './send-ai-chat-message.dto';

const base = {
  content: 'find jobs',
  clientMessageId: '33333333-3333-4333-8333-333333333333',
};

describe('SendAiChatMessageDto locale', () => {
  it('accepts a locale while keeping it optional for legacy clients', async () => {
    for (const value of [undefined, 'vi', 'vi-VN', 'en-US']) {
      const dto = plainToInstance(SendAiChatMessageDto, {
        ...base,
        ...(value ? { locale: value } : {}),
      });
      await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
    }
  });

  it('rejects malformed locale tags', async () => {
    const dto = plainToInstance(SendAiChatMessageDto, {
      ...base,
      locale: 'vi_VN',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.some((error) => error.property === 'locale')).toBe(true);
  });
});
