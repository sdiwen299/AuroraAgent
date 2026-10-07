export interface AuthAccount {
  email: string;
  display_name: string;
}

export interface AuthStatus {
  auth_enabled: boolean;
  authenticated: boolean;
  has_accounts: boolean;
  account: AuthAccount | null;
}

/**
 * 是否需要展示登录/注册页。
 *
 * 首次运行（既没有账号也没有开启令牌鉴权）时后端仍是放行的，但产品上把
 * 登录页作为入口，默认引导用户先创建本地账号；已有账号或开启了令牌鉴权后，
 * 则完全由后端返回的 authenticated 决定。
 */
export function shouldPromptForAuth(status?: AuthStatus): boolean {
  if (!status) {
    return false;
  }
  if (!status.has_accounts && !status.auth_enabled) {
    return true;
  }
  return !status.authenticated;
}

/** 首次运行没有账号时默认进入注册；其余情况默认进入登录。 */
export function defaultAuthMode(status?: AuthStatus): 'login' | 'register' {
  return status && !status.has_accounts && !status.auth_enabled ? 'register' : 'login';
}
