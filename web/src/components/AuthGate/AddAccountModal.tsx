import { Alert, Button, Input, Modal, Radio } from 'antd';
import { useState, type FormEvent } from 'react';
import { authErrorMessage, registerAccount } from '@/services/auth';
import type { UserRole } from './model';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function AddAccountModal({ onClose, onCreated }: Props) {
  const [role, setRole] = useState<UserRole>('hr');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await registerAccount({ email, password, role });
      onCreated();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open title="添加本地账号" footer={null} onCancel={submitting ? undefined : onClose} closable={!submitting} maskClosable={false} width={440}>
      <form className="op-auth-form" onSubmit={submit}>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Radio.Group className="op-auth-role-picker" aria-label="账号身份" value={role} onChange={(event) => setRole(event.target.value)} optionType="button" buttonStyle="solid" options={[{ value: 'candidate', label: '求职者' }, { value: 'hr', label: 'HR 招聘' }]} />
        <Input aria-label="新账号邮箱" placeholder="邮箱" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
        <Input.Password aria-label="新账号密码" placeholder="密码（至少 8 位）" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        <Button type="primary" htmlType="submit" loading={submitting}>创建账号</Button>
      </form>
    </Modal>
  );
}
