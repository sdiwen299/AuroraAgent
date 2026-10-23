import { createApiClient } from './http';
import type { AuthAccount, AuthStatus, UserRole } from '@/components/AuthGate/model';

const http = createApiClient({ baseURL: '/api', timeout: 10000 });

export async function getAuthStatus(): Promise<AuthStatus> {
  const { data } = await http.get<AuthStatus>('/auth/status?include_role=1');
  return data;
}

export interface AuthSession {
  token: string;
  account: AuthAccount;
  role?: UserRole;
}

export async function registerAccount(payload: {
  email: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}): Promise<AuthSession> {
  const { data } = await http.post<AuthSession>('/auth/register', {
    email: payload.email,
    password: payload.password,
    display_name: payload.displayName ?? '',
    role: payload.role ?? 'candidate',
  });
  return data;
}

export async function loginAccount(payload: {
  email: string;
  password: string;
  role?: UserRole;
}): Promise<AuthSession> {
  const { data } = await http.post<AuthSession>('/auth/login', { ...payload, role: payload.role ?? 'candidate' });
  return data;
}

export async function logoutAccount(): Promise<void> {
  await http.post('/auth/logout', {});
}

export async function switchAccountRole(role: UserRole): Promise<{ role: UserRole }> {
  const { data } = await http.post<{ account: AuthAccount; role: UserRole }>('/auth/role', { role });
  return data;
}

/** 从后端错误体里取出可直接展示的中文提示。 */
export function authErrorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })
    ?.response;
  const message = response?.data?.error;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  // 后端未重启时旧进程没有账号接口，SPA 兜底会把它变成 404/405。
  if (response?.status === 404 || response?.status === 405) {
    return '服务端还没有账号接口，请重启后端服务后重试。';
  }
  return '操作失败，请稍后重试。';
}
