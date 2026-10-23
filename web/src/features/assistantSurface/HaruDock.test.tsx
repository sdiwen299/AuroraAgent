// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HaruDock from './HaruDock';
import { AssistantSurfaceProvider } from './AssistantSurfaceProvider';

// dock 两侧是 3D 卡片 / 聊天窗，隐藏分支不渲染它们，这里只关心入口归属。
vi.mock('./LanyardDock', () => ({ default: () => <div data-testid="lanyard-dock" /> }));
vi.mock('./CalendarHaruPresentation', () => ({ default: () => <div data-testid="calendar-dock" /> }));
vi.mock('./HaruChatWindow', () => ({ default: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function render(visible: boolean, onRestore: () => void) {
  act(() => {
    root?.render(
      <AssistantSurfaceProvider>
        <HaruDock
          visible={visible}
          activity="idle"
          zoom={1}
          onZoomChange={() => {}}
          onHide={() => {}}
          onRestore={onRestore}
        />
      </AssistantSurfaceProvider>,
    );
  });
}

function restoreEntry(): HTMLButtonElement | null | undefined {
  return host?.querySelector<HTMLButtonElement>('button[aria-label="显示 AI 助手"]');
}

describe('HaruDock 隐藏后的回收入口', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it('隐藏后在原位留下回收入口，点按即恢复', () => {
    const onRestore = vi.fn();
    render(false, onRestore);

    const entry = restoreEntry();
    expect(entry).toBeTruthy();
    expect(host?.querySelector('[data-testid="lanyard-dock"]')).toBeNull();

    act(() => {
      entry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('可见时只渲染完整 dock，不出现回收入口', () => {
    render(true, vi.fn());

    expect(host?.querySelector('[data-testid="lanyard-dock"]')).toBeTruthy();
    expect(restoreEntry()).toBeNull();
  });

  it('没有回收入口时不渲染任何节点', () => {
    act(() => {
      root?.render(
        <AssistantSurfaceProvider>
          <HaruDock visible={false} activity="idle" zoom={1} onZoomChange={() => {}} onHide={() => {}} />
        </AssistantSurfaceProvider>,
      );
    });

    expect(host?.innerHTML).toBe('');
  });
});