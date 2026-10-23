// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LanyardDock from './LanyardDock';

// 3D 挂绳与弹弓物理/动画都不属于这条断言，替换成占位节点。
vi.mock('@/components/Lanyard/Lanyard', () => ({ default: () => <div data-testid="lanyard-3d" /> }));
vi.mock('@/components/SlingButton/SlingButton', () => ({
  default: ({ onActivate, ariaLabel }: { onActivate: () => void; ariaLabel: string }) => (
    <button type="button" aria-label={ariaLabel} onClick={onActivate} />
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function render(onHide: () => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <LanyardDock
        triggerRef={{ current: null }}
        onAnchorRectChange={() => {}}
        onToggle={() => {}}
        onHide={onHide}
      />,
    );
  });
}

function hideControl(): HTMLButtonElement {
  const control = host?.querySelector<HTMLButtonElement>('button[aria-label="隐藏挂绳卡片"]');
  if (!control) throw new Error('隐藏入口未渲染');
  return control;
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('LanyardDock 退出确认', () => {
  beforeEach(() => {
    render(vi.fn());
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it('触发隐藏后先弹确认窗，不会直接收起 dock', () => {
    const onHide = vi.fn();
    act(() => {
      root?.render(
        <LanyardDock
          triggerRef={{ current: null }}
          onAnchorRectChange={() => {}}
          onToggle={() => {}}
          onHide={onHide}
        />,
      );
    });

    click(hideControl());

    const dialog = host?.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('是否退出小窗');
    expect(dialog?.textContent).toContain('是否退出小窗');
    expect(onHide).not.toHaveBeenCalled();
  });

  it('选“否”保留 dock，再触发并选“是”才隐藏', () => {
    const onHide = vi.fn();
    act(() => {
      root?.render(
        <LanyardDock
          triggerRef={{ current: null }}
          onAnchorRectChange={() => {}}
          onToggle={() => {}}
          onHide={onHide}
        />,
      );
    });

    click(hideControl());
    const no = [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === '否');
    expect(no).toBeTruthy();
    click(no as HTMLButtonElement);

    expect(onHide).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="dialog"]')).toBeNull();
    expect(hideControl()).toBeTruthy();

    click(hideControl());
    const yes = [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === '是');
    click(yes as HTMLButtonElement);

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Esc 与点击窗外都能取消确认', () => {
    const onHide = vi.fn();
    act(() => {
      root?.render(
        <LanyardDock
          triggerRef={{ current: null }}
          onAnchorRectChange={() => {}}
          onToggle={() => {}}
          onHide={onHide}
        />,
      );
    });

    click(hideControl());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host?.querySelector('[role="dialog"]')).toBeNull();

    click(hideControl());
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(host?.querySelector('[role="dialog"]')).toBeNull();
    expect(onHide).not.toHaveBeenCalled();
  });
});
