import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiCvMatchingConsentCard from '../../src/components/consent/AiCvMatchingConsentCard';
import { apiRequest } from '../../src/lib/api';

vi.mock('../../src/auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'test-token' }) }));
vi.mock('../../src/lib/api', () => ({ apiRequest: vi.fn(), API_URL: '/api' }));

const policy = { scope: 'cv_matching', consentVersion: 'current-v2', policyHash: 'a'.repeat(64) };
const granted = { ...policy, _id: 'consent-id', status: 'GRANTED', grantedAt: '2026-11-18', revokedAt: null };
const request = vi.mocked(apiRequest);

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path) => path.includes('/policy/') ? policy : null);
});

describe('AI CV matching consent', () => {
  it('disables actions while loading', () => {
    request.mockReturnValue(new Promise(() => {}));
    render(<AiCvMatchingConsentCard />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Đang tải');
  });

  it('shows load errors without enabling consent', async () => {
    request.mockRejectedValue(new Error('Không thể tải quyền.'));
    render(<AiCvMatchingConsentCard />);
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể tải quyền.');
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });

  it('grants explicitly with the fetched version/hash then revokes', async () => {
    request.mockImplementation(async (path) => {
      if (path.includes('/policy/')) return policy;
      if (path.endsWith('/grant')) return granted;
      if (path.endsWith('/revoke')) return { ...granted, status: 'REVOKED' };
      return null;
    });
    render(<AiCvMatchingConsentCard />);
    const grant = await screen.findByRole('button', { name: 'Cấp quyền đối chiếu CV AI' });
    await waitFor(() => expect(grant.hasAttribute('disabled')).toBe(false));
    expect(request).toHaveBeenCalledWith('/ai/cv-consents/current/cv_matching', { accessToken: 'test-token' });
    expect(screen.getByText('TalentPulse may process the candidate CV for the explicitly selected AI CV matching purpose.')).toBeTruthy();
    expect(screen.getByText(/current-v2/)).toBeTruthy();
    fireEvent.click(grant);
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi quyền đối chiếu CV AI' }));
    await screen.findByRole('button', { name: 'Cấp quyền đối chiếu CV AI' });
    for (const action of ['grant', 'revoke']) {
      expect(request).toHaveBeenCalledWith(`/ai/cv-consents/${action}`, {
        method: 'POST', accessToken: 'test-token',
        body: { ...policy, source: 'web', sourceMetadata: { locale: document.documentElement.lang || 'vi' } },
      });
    }
  });

  it.each(['consentVersion', 'policyHash'])('does not show stale %s as current consent, but allows revocation', async (field) => {
    request.mockImplementation(async (path) => path.includes('/policy/') ? policy : { ...granted, [field]: 'old' });
    render(<AiCvMatchingConsentCard />);
    expect((await screen.findByRole('status')).textContent).toContain('Chưa cấp quyền theo chính sách hiện tại');
    expect(await screen.findByRole('button', { name: 'Thu hồi quyền đối chiếu CV AI' })).toBeTruthy();
  });

  it('keeps the current grant on mutation error and prevents duplicate requests while saving', async () => {
    request.mockImplementation(async (path) => path.includes('/policy/') ? policy : granted);
    render(<AiCvMatchingConsentCard />);
    const button = await screen.findByRole('button', { name: 'Thu hồi quyền đối chiếu CV AI' });
    let reject!: (error: Error) => void;
    request.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    fireEvent.click(button);
    expect(button.hasAttribute('disabled')).toBe(true);
    reject(new Error('Không thể thu hồi.'));
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể thu hồi.');
    expect(screen.getByRole('button', { name: 'Thu hồi quyền đối chiếu CV AI' }).hasAttribute('disabled')).toBe(false);
  });
});
