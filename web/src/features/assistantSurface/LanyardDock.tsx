import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import Lanyard from '@/components/Lanyard/Lanyard';
import brandLanyard from '@/components/Lanyard/lanyard-brand.png';
import SlingButton from '@/components/SlingButton/SlingButton';
import type { PilotMascotRect } from '@/features/pilotMascot/pilotMascotPreference';
import styles from './LanyardDock.module.css';

interface Props {
  triggerRef: RefObject<HTMLButtonElement>;
  onAnchorRectChange: (rect: PilotMascotRect) => void;
  onToggle: () => void;
  onHide: () => void;
  panelOpen?: boolean;
  notification?: { status: 'success' | 'error'; conversationId: number } | null;
}

/** 挂绳卡片版 AI 助手 dock，替代 Live2D PilotMascot。
 * 抄 CalendarHaruPresentation 的 wrapper：button 作 trigger（ref + 锚点上报），
 * 内部挂 Lanyard 3D 卡片；保留通知角标和隐藏入口。
 * 隐藏是可逆操作，所以弹弓按钮只负责发起确认，确认后 dock 才让位给回收入口。 */
export default function LanyardDock({
  triggerRef,
  onAnchorRectChange,
  onToggle,
  onHide,
  panelOpen = false,
  notification = null,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const confirmYesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    confirmYesRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && confirmRef.current?.contains(target)) return;
      setConfirmOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmOpen]);

  useLayoutEffect(() => {
    const report = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        onAnchorRectChange({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
      }
    };
    report();
    if (!triggerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [onAnchorRectChange, triggerRef]);

  return (
    <div className={styles.dock}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={onToggle}
        aria-label={`AI 助手 · ${panelOpen ? '收起' : '打开'}对话`}
        aria-expanded={panelOpen}
        aria-controls="haru-chat-window"
      >
        <span className={styles.card}>
          <Lanyard lanyardImage={brandLanyard} />
        </span>
        {notification && (
          <span
            className={styles.badge}
            data-status={notification.status}
            aria-label={notification.status === 'success' ? '处理完成' : '需要查看'}
          />
        )}
      </button>
      <span className={styles.hide}>
        <SlingButton
          ariaLabel="隐藏挂绳卡片"
          hint="点按隐藏挂绳卡片，或把它甩出去松手隐藏。"
          onActivate={() => setConfirmOpen(true)}
          padColor="var(--op-surface, #fffdf6)"
          iconColor="var(--op-primary, #20340f)"
          accentColor="var(--op-action, #9f3410)"
          wellColor="rgba(32, 52, 15, 0.16)"
          bandColor="rgba(32, 52, 15, 0.58)"
          size={22}
          strokeWidth={1.75}
          armAt={16}
          maxPull={50}
          launchSpeed={1150}
          flight={44}
          particles={6}
        >
          <CloseOutlined />
        </SlingButton>
      </span>
      {confirmOpen ? (
        <div
          ref={confirmRef}
          className={styles.confirm}
          role="dialog"
          aria-label="是否退出小窗"
          aria-modal={false}
        >
          <p className={styles.confirmText}>是否退出小窗</p>
          <div className={styles.confirmActions}>
            <button
              ref={confirmYesRef}
              type="button"
              className={styles.confirmYes}
              onClick={() => {
                setConfirmOpen(false);
                onHide();
              }}
            >
              是
            </button>
            <button
              type="button"
              className={styles.confirmNo}
              onClick={() => setConfirmOpen(false)}
            >
              否
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
