import { describe, expect, it } from 'vitest';
import { defaultAuthMode, shouldPromptForAuth, type AuthStatus } from './model';

const status = (overrides: Partial<AuthStatus> = {}): AuthStatus => ({
  auth_enabled: false,
  authenticated: true,
  has_accounts: true,
  account: { email: 'zhe@example.com', display_name: '筱哲' },
  ...overrides,
});

describe('AuthGate model', () => {
  it('prompts on first run so the login page is the entry point', () => {
    expect(shouldPromptForAuth()).toBe(false);
    expect(
      shouldPromptForAuth(status({ has_accounts: false, authenticated: true, account: null })),
    ).toBe(true);
  });

  it('lets an authenticated account through', () => {
    expect(shouldPromptForAuth(status())).toBe(false);
  });

  it('prompts when accounts exist but the session is missing or invalid', () => {
    expect(shouldPromptForAuth(status({ authenticated: false, account: null }))).toBe(true);
  });

  it('keeps the legacy token flow when auth is enabled without accounts', () => {
    expect(
      shouldPromptForAuth(status({ auth_enabled: true, has_accounts: false, account: null })),
    ).toBe(false);
    expect(
      shouldPromptForAuth(
        status({ auth_enabled: true, has_accounts: false, authenticated: false, account: null }),
      ),
    ).toBe(true);
  });

  it('defaults to register on first run and login afterwards', () => {
    expect(defaultAuthMode(undefined)).toBe('login');
    expect(defaultAuthMode(status({ has_accounts: false }))).toBe('register');
    expect(defaultAuthMode(status({ auth_enabled: true, has_accounts: false }))).toBe('login');
    expect(defaultAuthMode(status())).toBe('login');
  });
});
