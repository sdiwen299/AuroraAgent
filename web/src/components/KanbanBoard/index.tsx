import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  useDndMonitor,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { Input, Modal, Typography, message } from 'antd';
import { updateApplication } from '@/services/applications';
import {
  KANBAN_COLUMNS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/types/application';
import type { Application, ApplicationStatus } from '@/types/application';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import {
  buildApplicationStatusPayload,
  requiresClosedReason,
  resolveKanbanDropDestination,
  stripGhostIdPrefix,
  willRecordFirstStatusTimestamp,
  filterAndSortApplications,
  DEFAULT_APPLICATION_VIEW_STATE,
  type ApplicationViewState,
} from './applicationLifecycle';
import styles from './KanbanBoard.module.css';

interface KanbanBoardProps {
  applications: Application[];
  onOpenDetail?: (app: Application) => void;
  onAttachToPilot?: (attachment: import('@/types/chat').PilotContextAttachment) => void;
  viewState?: ApplicationViewState;
}

export default function KanbanBoard({ applications, onOpenDetail, onAttachToPilot, viewState }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<ApplicationStatus | null>(null);
  const [pendingMove, setPendingMove] = useState<{ app: Application; status: ApplicationStatus } | null>(null);
  const [closedReason, setClosedReason] = useState('');
  const [saving, setSaving] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef(false);

  useEffect(() => {
    holdRef.current = activeId !== null || expandedStatus !== null || pendingMove !== null;
  }, [activeId, expandedStatus, pendingMove]);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const AUTO_SPEED = 40;
    const WHEEL_SCALE = 0.8;
    const EASE = 0.12;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let last = performance.now();
    let current = el.scrollLeft;
    let target = current;
    let written = current;
    let period = 0;
    let looping = false;
    let hovering = false;

    const set = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : null;
    const ghost = el.lastElementChild instanceof HTMLElement ? el.lastElementChild : null;

    const measure = () => {
      if (!set) return;
      const gap = Number.parseFloat(window.getComputedStyle(el).columnGap) || 0;
      period = set.offsetWidth + gap;
      looping = period > 0 && set.offsetWidth >= el.clientWidth;
      if (ghost) ghost.style.display = looping ? '' : 'none';
    };
    measure();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(el);
    if (set) observer?.observe(set);

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !looping) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      target += Math.max(-160, Math.min(160, delta * unit)) * WHEEL_SCALE;
    };

    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') hovering = true;
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') hovering = false;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('pointerleave', onPointerLeave);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 64);
      last = now;

      let actual = el.scrollLeft;
      if (looping && actual >= period) {
        actual -= period;
        el.scrollLeft = actual;
        written = actual;
      }
      if (Math.abs(actual - written) > 1) {
        current = target = actual;
      }
      if (looping && !hovering && !holdRef.current && !reduceMotion) {
        target += AUTO_SPEED * (dt / 1000);
      }
      if (looping) {
        const centered = (((target - current) % period) + period * 1.5) % period - period / 2;
        target = current + centered;
      }

      current += (target - current) * (1 - Math.pow(1 - EASE, dt / 16.67));
      if (looping) current = ((current % period) + period) % period;

      if (Math.abs(current - el.scrollLeft) > 0.5) {
        el.scrollLeft = current;
        written = current;
      } else {
        written = el.scrollLeft;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('pointerleave', onPointerLeave);
      observer?.disconnect();
    };
  }, []);

  const columns = useMemo(() => {
    const grouped = {} as Record<ApplicationStatus, Application[]>;
    for (const s of KANBAN_COLUMNS) grouped[s] = [];
    filterAndSortApplications(applications, viewState ?? DEFAULT_APPLICATION_VIEW_STATE).forEach((app) => {
      if (grouped[app.status]) grouped[app.status].push(app);
    });
    return grouped;
  }, [applications, viewState]);

  const activeRecord = applications.find((a) => a.id === activeId) ?? null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(stripGhostIdPrefix(event.active.id)));
  };

  const requestStatusChange = (app: Application, newStatus: ApplicationStatus) => {
    if (newStatus === app.status) return;
    setPendingMove({ app, status: newStatus });
    setClosedReason('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const appId = Number(stripGhostIdPrefix(active.id));
    const app = applications.find((item) => item.id === appId);
    if (!app) return;

    const destination = resolveKanbanDropDestination(String(over.id));
    if (!destination) return;
    if (destination.kind === 'pilot') {
      onAttachToPilot?.({
        kind: 'application',
        id: String(app.id),
        label: `${app.company_name} · ${app.position_name}`,
      });
      return;
    }
    if (app.status !== destination.status) requestStatusChange(app, destination.status);
  };

  const confirmStatusChange = async () => {
    if (!pendingMove) return;
    if (requiresClosedReason(pendingMove.app.status, pendingMove.status) && !closedReason.trim()) {
      message.error('请填写关闭原因');
      return;
    }
    setSaving(true);
    try {
      await updateApplication(
        pendingMove.app.id,
        buildApplicationStatusPayload(pendingMove.app, pendingMove.status, closedReason)
      );
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      message.success(`已移至「${STATUS_LABELS[pendingMove.status]}」`);
      setPendingMove(null);
      setClosedReason('');
    } catch {
      message.error('状态更新失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  useDndMonitor({
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  });

  const renderColumns = (decorative: boolean) =>
    KANBAN_COLUMNS.map((status) => (
      <KanbanColumn
        key={status}
        status={status}
        label={STATUS_LABELS[status]}
        color={STATUS_COLORS[status]}
        cards={columns[status]}
        activeId={activeId}
        onOpenDetail={onOpenDetail}
        onRequestStatusChange={requestStatusChange}
        expanded={status === expandedStatus}
        onToggleExpanded={() => setExpandedStatus((current) => (current === status ? null : status))}
        decorative={decorative}
      />
    ));

  return (
    <>
      <div className={styles.board} ref={boardRef}>
        <div className={styles.trackSet}>{renderColumns(false)}</div>
        <div className={styles.trackSet} aria-hidden="true">
          {renderColumns(true)}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeRecord ? <KanbanCard record={activeRecord} overlay /> : null}
      </DragOverlay>
      <Modal
        title="确认更新投递状态"
        open={!!pendingMove}
        okText="确认更新"
        cancelText="取消"
        confirmLoading={saving}
        onOk={confirmStatusChange}
        onCancel={() => {
          setPendingMove(null);
          setClosedReason('');
        }}
      >
        {pendingMove && (
          <div className={styles.confirmBody}>
            <Typography.Paragraph>
              {pendingMove.app.company_name} · {pendingMove.app.position_name}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              从「{STATUS_LABELS[pendingMove.app.status]}」移动到「{STATUS_LABELS[pendingMove.status]}」。
              {willRecordFirstStatusTimestamp(pendingMove.app, pendingMove.status)
                ? '首次进入该状态，将记录对应时间。'
                : '该状态已有首次时间记录，本次不会覆盖。'}
            </Typography.Paragraph>
            {requiresClosedReason(pendingMove.app.status, pendingMove.status) && (
              <Input.TextArea
                rows={3}
                value={closedReason}
                onChange={(event) => setClosedReason(event.target.value)}
                placeholder="填写关闭原因，例如：岗位关闭、主动放弃、已接受其他 offer"
              />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
