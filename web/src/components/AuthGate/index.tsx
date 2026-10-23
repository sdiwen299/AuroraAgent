import { LockOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Modal, Skeleton } from 'antd';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import LandingPage from '@/landing/LandingPage';
import { authErrorMessage, getAuthStatus, loginAccount, registerAccount } from '@/services/auth';
import { setStoredAuthToken } from '@/services/authToken';
import { defaultAuthMode, shouldPromptForAuth } from './model';

interface Props {
  children: ReactNode;
}

/**
 * 入口门禁：未登录时展示落地页，登录/注册放在小窗里弹出。
 * 通过后直接把工作台渲染出来（跳转由 React 状态完成，无需换页）。
 */
export default function AuthGate({ children }: Props) {
  const [token, setToken] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const statusQuery = useQuery({
    queryKey: ['auth-status'],
    queryFn: getAuthStatus,
    retry: false,
  });

  useEffect(() => {
    if (!statusQuery.data) {
      return;
    }
    setMode(defaultAuthMode(statusQuery.data));
    if (shouldPromptForAuth(statusQuery.data)) {
      setOpen(true);
    }
  }, [statusQuery.data]);

  if (statusQuery.isLoading) {
    return (
      <main className="op-auth-boot" aria-busy="true">
        <Skeleton active paragraph={{ rows: 2 }} />
      </main>
    );
  }

  if (!shouldPromptForAuth(statusQuery.data)) {
    return children;
  }

  const legacyTokenMode = Boolean(statusQuery.data?.auth_enabled && !statusQuery.data?.has_accounts);
  const registering = mode === 'register';

  function openLogin() {
    setMode('login');
    setError('');
    setOpen(true);
  }

  function openRegister() {
    setMode('register');
    setError('');
    setOpen(true);
  }

  function enterInterview() {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'interview');
      url.hash = 'deploy';
      window.history.replaceState({ view: 'interview' }, '', `${url.pathname}${url.search}${url.hash}`);
    }
    openLogin();
  }

  async function submitToken() {
    setStoredAuthToken(token);
    const result = await statusQuery.refetch();
    setInvalid(Boolean(result.data?.auth_enabled && !result.data.authenticated));
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const session =
        mode === 'register'
          ? await registerAccount({ email, password, displayName })
          : await loginAccount({ email, password });
      setStoredAuthToken(session.token);
      await statusQuery.refetch();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <LandingPage onLogin={openLogin} onRegister={openRegister} onEnterInterview={enterInterview} />
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        centered
        width={440}
        maskClosable={false}
        className="op-auth-modal"
        title={
          legacyTokenMode ? '本地访问令牌' : registering ? '创建本地账号' : '登录曙光'
        }
      >
        {legacyTokenMode ? (
          <div className="op-auth-form">
            <p className="op-auth-sub">
              输入本地访问令牌，进入你的求职管理台：投递、面试与 Offer 都在同一处推进。
            </p>
            {invalid ? <Alert type="error" showIcon message="访问令牌无效，请重新输入。" /> : null}
            <Input.Password
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onPressEnter={submitToken}
              placeholder="访问令牌"
              size="large"
              autoFocus
            />
            <Button
              type="primary"
              icon={<LockOutlined />}
              onClick={submitToken}
              loading={statusQuery.isFetching}
              block
              size="large"
            >
              继续
            </Button>
          </div>
        ) : (
          <>
            <div className="op-auth-tabs" role="tablist" aria-label="登录或注册">
              <button
                type="button"
                role="tab"
                aria-selected={!registering}
                className={`op-auth-tab${registering ? '' : ' is-active'}`}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={registering}
                className={`op-auth-tab${registering ? ' is-active' : ''}`}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                注册
              </button>
            </div>
            <p className="op-auth-sub">
              {registering
                ? '账号仅保存在本机数据目录，用于把工作台锁定到你自己。'
                : '用注册时填写的邮箱和密码登录，回到你的投递、面试与 Offer。'}
            </p>
            <form className="op-auth-form" onSubmit={submitAccount}>
              {error ? <Alert type="error" showIcon message={error} /> : null}
              {registering ? (
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="昵称（可选）"
                  size="large"
                  autoComplete="nickname"
                />
              ) : null}
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="邮箱"
                size="large"
                autoComplete="email"
                autoFocus
              />
              <Input.Password
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={registering ? '密码（至少 8 位）' : '密码'}
                size="large"
                autoComplete={registering ? 'new-password' : 'current-password'}
              />
              <Button type="primary" htmlType="submit" loading={submitting} block size="large">
                {registering ? '创建账号并进入' : '登录'}
              </Button>
            </form>
          </>
        )}
        <div className="op-auth-foot">本地部署 · 数据留在你的环境内</div>
      </Modal>
    </>
  );
}
