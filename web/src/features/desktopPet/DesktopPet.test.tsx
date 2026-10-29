// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DesktopPet from './DesktopPet';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function pet(): HTMLDivElement {
  const element = host?.querySelector<HTMLDivElement>('[data-desktop-pet]');
  if (!element) throw new Error('桌宠容器未渲染');
  return element;
}

describe('DesktopPet 桌宠浮层', () => {
  beforeEach(() => {
    (window as typeof window & { localStorage?: Storage }).localStorage?.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(<DesktopPet />);
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it('渲染定位到视口内的桌宠容器，默认处于待机状态', () => {
    const element = pet();
    expect(element.getAttribute('data-desktop-pet-state')).toBe('standby');
    expect(Number.parseFloat(element.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(element.style.top)).toBeGreaterThanOrEqual(0);
  });

  it('右键依次切换形象状态', () => {
    const element = pet();
    act(() => {
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(element.getAttribute('data-desktop-pet-state')).toBe('sleep');
  });
});
