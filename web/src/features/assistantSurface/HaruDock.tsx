import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CalendarHaruPresentation from './CalendarHaruPresentation';
import { type PilotMascotActivity, type PilotMascotAnimationLevel } from '@/features/pilotMascot/PilotMascot';
import LanyardDock from './LanyardDock';
import HaruRestoreChip from './HaruRestoreChip';
import type { PilotMascotRect } from '@/features/pilotMascot/pilotMascotPreference';
import { useAssistantSurface } from './AssistantSurfaceProvider';
import HaruChatWindow from './HaruChatWindow';

interface Props {
  compact?: boolean;
  visible: boolean;
  activity: PilotMascotActivity;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  animationLevel?: PilotMascotAnimationLevel;
  positionResetToken?: number;
  onHide: () => void;
  onRestore?: () => void;
  onOpen?: () => void;
  onExpand?: () => void;
  calendarHost?: HTMLElement | null;
  calendarActive?: boolean;
}

export default function HaruDock({
  visible,
  activity,
  animationLevel,
  onHide,
  onRestore,
  onOpen,
  onExpand,
  calendarHost,
  calendarActive = false,
}: Props) {
  const surface = useAssistantSurface();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<PilotMascotRect>();

  // 隐藏后不留空白，但原位保留一个回收入口，避免只能去设置页把它叫回来。
  if (!visible) return onRestore ? <HaruRestoreChip onRestore={onRestore} /> : null;

  const notification = surface.completionNotice
    ? {
        status: surface.completionNotice.status === 'completed' ? 'success' as const : 'error' as const,
        conversationId: surface.completionNotice.conversationId,
      }
    : null;

  return (
    <>
      {calendarActive ? (calendarHost ? createPortal(<CalendarHaruPresentation
        activity={notification?.status ?? activity}
        panelOpen={surface.surface === 'haru_chat'}
        onToggle={() => {
          if (notification) surface.openCompletionNotice();
          else if (surface.surface === 'haru_chat') surface.closeSurface();
          else if (onOpen) onOpen();
          else surface.openHaru();
        }}
        triggerRef={triggerRef}
        onAnchorRectChange={setAnchorRect}
        animationLevel={animationLevel}
      />, calendarHost) : null) : <LanyardDock
        triggerRef={triggerRef}
        onAnchorRectChange={setAnchorRect}
        onToggle={() => {
          if (notification) surface.openCompletionNotice();
          else if (surface.surface === 'haru_chat') surface.closeSurface();
          else if (onOpen) onOpen();
          else surface.openHaru();
        }}
        onHide={() => {
          surface.closeSurface();
          onHide();
        }}
        panelOpen={surface.surface === 'haru_chat'}
        notification={notification}
      />}
      <HaruChatWindow returnFocusRef={triggerRef} onExpand={onExpand} anchorRect={anchorRect} />
    </>
  );
}
