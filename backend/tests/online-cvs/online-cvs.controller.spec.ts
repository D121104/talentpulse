import { OnlineCVsController } from 'src/online-cvs/online-cvs.controller';
import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';

describe('OnlineCVsController generation snapshot responses', () => {
  it('returns only the pending summary and never exposes the raw snapshot', async () => {
    const onlineCv = {
      _id: '22222222-2222-4222-8222-222222222222',
      generationSnapshot: {
        pendingDraft: {
          operationId: '33333333-3333-4333-8333-333333333333',
          reviewStatus: 'PENDING',
          draftHash: 'a'.repeat(64),
          expiresAt: '2026-11-28T00:00:00.000Z',
          draft: { career_objective: 'Private generated text' },
          sourceRefsByPath: { '/career_objective': ['/candidate/objective'] },
        },
      },
    };
    const service = {
      findOne: jest.fn().mockResolvedValue(onlineCv),
    } as unknown as OnlineCVsService;
    const controller = new OnlineCVsController(service);

    const response = await controller.findOne(onlineCv._id, {
      _id: '11111111-1111-4111-8111-111111111111',
    } as any);

    expect(response).toEqual({
      _id: onlineCv._id,
      pendingGeneration: {
        operationId: '33333333-3333-4333-8333-333333333333',
        reviewStatus: 'PENDING',
        draftHash: 'a'.repeat(64),
        expiresAt: '2026-11-28T00:00:00.000Z',
      },
    });
    expect(response).not.toHaveProperty('generationSnapshot');
    expect(JSON.stringify(response)).not.toContain('Private generated text');
    expect(service.findOne).toHaveBeenCalledWith(onlineCv._id, {
      _id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('routes draft discard to the owner-scoped service boundary', async () => {
    const service = {
      discardGenerationDraft: jest.fn().mockResolvedValue(undefined),
    } as unknown as OnlineCVsService;
    const controller = new OnlineCVsController(service);
    const owner = { _id: '11111111-1111-4111-8111-111111111111' } as any;

    await expect(
      controller.discardGenerationDraft(
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        owner,
      ),
    ).resolves.toBeUndefined();

    expect(service.discardGenerationDraft).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      owner,
    );
  });
});
