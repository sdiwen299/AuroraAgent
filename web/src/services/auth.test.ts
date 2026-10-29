import { afterEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./http', () => ({
  createApiClient: () => http,
}));

import { loginAccount, registerAccount, switchAccountRole } from './auth';

afterEach(() => {
  http.get.mockReset();
  http.post.mockReset();
});

describe('auth service request shapes', () => {
  it('registers with the chosen default role', async () => {
    http.post.mockResolvedValue({ data: { token: 't', account: {}, role: 'hr' } });

    await registerAccount({ email: 'hr@example.com', password: 'supersecret', role: 'hr' });

    expect(http.post).toHaveBeenCalledWith('/auth/register', {
      email: 'hr@example.com',
      password: 'supersecret',
      display_name: '',
      role: 'hr',
    });
  });

  it('logs in under the requested view role', async () => {
    http.post.mockResolvedValue({ data: { token: 't', account: {}, role: 'candidate' } });

    await loginAccount({ email: 'zhe@example.com', password: 'supersecret', role: 'candidate' });

    expect(http.post).toHaveBeenCalledWith('/auth/login', {
      email: 'zhe@example.com',
      password: 'supersecret',
      role: 'candidate',
    });
  });

  it('switches the active view role', async () => {
    http.post.mockResolvedValue({ data: { account: {}, role: 'hr' } });

    const result = await switchAccountRole('hr');

    expect(http.post).toHaveBeenCalledWith('/auth/role', { role: 'hr' });
    expect(result.role).toBe('hr');
  });
});
