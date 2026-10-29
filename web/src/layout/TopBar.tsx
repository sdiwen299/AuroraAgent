import { Button } from 'antd';
import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import type { UserRole } from '@/components/AuthGate/model';
import styles from './TopBar.module.css';

export interface TopBarAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
}

export interface TopBarRoleSwitch {
  role: UserRole;
  onSwitch: (role: UserRole) => void;
}

export interface TopBarProps {
  compact?: boolean;
  summary?: string;
  primaryAction?: TopBarAction;
  onSearch: () => void;
  onOpenSettings: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  roleSwitch?: TopBarRoleSwitch;
}

function greeting(): string {
  const h = dayjs().hour();
  if (h < 6) return '夜深了，注意休息';
  if (h < 12) return '早上好，继续加油';
  if (h < 18) return '下午好，保持节奏';
  return '晚上好，今天辛苦了';
}

export default function TopBar({
  primaryAction,
  onSearch,
  onOpenSettings,
  summary,
  compact = false,
  fullscreen = false,
  onToggleFullscreen,
  roleSwitch,
}: TopBarProps) {
  return (
    <header className={`${styles.topbar} ${compact ? styles.compact : ''} op-topbar`}>
      {!compact ? <div className={styles.greetingBlock}>
        <div className={styles.metaRow}>
          <span className={`${styles.eyebrow} op-eyebrow`}>今日</span>
          <span className={styles.date}>
            {summary ? `${summary} · ` : ''}
            {dayjs().format('YYYY 年 M 月 D 日')}
          </span>
        </div>
        <div className={styles.greeting}>
          {greeting()}
        </div>
      </div> : null}
      <div className={`${styles.actions} op-topbar-actions`}>
        {roleSwitch ? (
          <div className={styles.roleSwitch} role="group" aria-label="切换使用身份">
            <button
              type="button"
              className={`${styles.roleOption}${roleSwitch.role === 'candidate' ? ` ${styles.roleOptionActive}` : ''}`}
              aria-pressed={roleSwitch.role === 'candidate'}
              onClick={() => roleSwitch.onSwitch('candidate')}
            >
              求职者
            </button>
            <button
              type="button"
              className={`${styles.roleOption}${roleSwitch.role === 'hr' ? ` ${styles.roleOptionActive}` : ''}`}
              aria-pressed={roleSwitch.role === 'hr'}
              onClick={() => roleSwitch.onSwitch('hr')}
            >
              HR 招聘
            </button>
          </div>
        ) : null}
        <Button className={styles.actionButton} icon={<SearchOutlined />} onClick={onSearch}>
          快速打开 <span style={{ opacity: 0.6, marginLeft: 4 }}>{typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</span>
        </Button>
        <Button
          className={styles.actionButton}
          icon={<SettingOutlined />}
          onClick={onOpenSettings}
          aria-label="设置"
        />
        {onToggleFullscreen ? (
          <Button
            className={styles.actionButton}
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? '退出全屏' : '全屏展开'}
            aria-pressed={fullscreen}
            title={fullscreen ? '退出全屏' : '全屏展开'}
          />
        ) : null}
        {primaryAction ? (
          <Button
            className={styles.primaryAction}
            type="primary"
            icon={primaryAction.icon ?? <PlusOutlined />}
            onClick={primaryAction.onClick}
            aria-label={primaryAction.ariaLabel ?? primaryAction.label}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
