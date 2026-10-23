// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';
import styles from './LandingPage.module.css';

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
  vi.stubGlobal('scrollTo', () => undefined);
  Element.prototype.scrollTo = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('LandingPage 标题', () => {
  it('标题仍是带品牌样式的真实 h1，文案与高亮片段完整', () => {
    act(() => root.render(<LandingPage onLogin={() => undefined} onRegister={() => undefined} />));

    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.className).toContain(styles.headline);
    expect(h1?.innerHTML).toContain('AI 面试陪练');
    expect(h1?.innerHTML).toContain('让每一场面试');

    const marker = h1?.querySelector(`.${styles.marker}`);
    expect(marker?.textContent).toBe('都更有把握。');
  });

  it('预览引导标题在canvas 不可用时仍保留完整可读文案', () => {
    act(() => root.render(<LandingPage onLogin={() => undefined} onRegister={() => undefined} />));

    const heading = container.querySelector(`.${styles.previewLeadTitle}`);
    expect(heading?.getAttribute('aria-label')).toBe('好 Offer，从一次完美的模拟开始');
    expect(heading?.textContent).toContain('好 Offer，');
    expect(heading?.textContent).toContain('从一次完美的模拟开始');
  });

  it('从导航和面试预览进入真实面试工作台入口', () => {
    const onEnterInterview = vi.fn();
    act(() => root.render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterInterview={onEnterInterview}
      />,
    ));

    const interviewLink = container.querySelector('a[href="/?view=interview#deploy"]');
    expect(interviewLink).not.toBeNull();
    act(() => interviewLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(onEnterInterview).toHaveBeenCalledTimes(1);

    const enterButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent?.includes('进入真实面试'));
    expect(enterButtons.length).toBeGreaterThan(0);
    act(() => enterButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onEnterInterview).toHaveBeenCalledTimes(2);
  });
});
