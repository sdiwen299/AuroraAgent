// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RippleHeadline from './RippleHeadline';
import styles from './RippleHeadline.module.css';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render() {
  act(() =>
    root.render(
      <RippleHeadline className="headline">
        AI 面试陪练
        <br />
        让每一场面试
        <br />
        <span>都更有把握。</span>
      </RippleHeadline>,
    ),
  );
  const h1 = container.querySelector('h1');
  if (!h1) throw new Error('RippleHeadline 未渲染 h1');
  return h1;
}

describe('RippleHeadline 降级与语义边界', () => {
  it('WebGL 不可用时保持真实 h1 文本，且不启用 hover 交接', () => {
    // jsdom 没有 WebGL 上下文，Renderer 构造会抛错，这条路径必须静默退回 CSS 静态标题。
    const h1 = render();

    expect(h1.textContent).toContain('AI 面试陪练');
    expect(h1.textContent).toContain('都更有把握。');
    expect(h1.className).toContain('headline');
    expect(h1.className).not.toContain(styles.wrapReady);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('涟漪画布对辅助技术隐藏，标题文本仍是唯一的可读内容', () => {
    const h1 = render();
    const overlay = h1.querySelector('[aria-hidden="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector('canvas')).toBeNull();
    expect(overlay?.textContent).toBe('');
    // 覆盖层不能改变标题的对外语义
    expect(h1.getAttribute('aria-label')).toBeNull();
    expect(h1.querySelector('h1')).toBeNull();
  });

  it('用户要求减弱动效时不把标题交给 canvas 交接', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));

    const h1 = render();
    expect(h1.className).not.toContain(styles.wrapReady);
  });
});