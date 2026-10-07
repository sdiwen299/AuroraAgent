// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RippleDistortion from './RippleDistortion';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 没有 WebGL 上下文，这里只替换渲染管线，保留真实的涟漪调度与实例属性上传路径，
// 通过几何体属性读回当前存活的涟漪。
const ogl = vi.hoisted(() => ({
  attributes: null as Record<string, { data: Float32Array; needsUpdate: boolean }> | null,
}));

vi.mock('ogl', () => {
  class Geometry {
    attributes: Record<string, { data: Float32Array; needsUpdate: boolean }> = {};

    constructor(_gl: unknown, attributes: Record<string, { data: Float32Array }>) {
      for (const [key, value] of Object.entries(attributes)) {
        this.attributes[key] = { data: value.data, needsUpdate: false };
      }
      ogl.attributes = this.attributes;
    }
  }

  class Renderer {
    gl: Record<string, unknown>;

    constructor() {
      this.gl = {
        canvas: document.createElement('canvas'),
        LINEAR: 9729,
        CLAMP_TO_EDGE: 33071,
        ONE: 1,
        clearColor: () => undefined,
        getExtension: () => null,
      };
    }

    setSize() {}
    render() {}
  }

  class Texture {
    image: unknown = null;
    needsUpdate = false;
    constructor(_gl: unknown, _options?: unknown) {}
  }

  class RenderTarget {
    texture = { needsUpdate: false };
    setSize() {}
  }

  class Program {
    constructor(_gl: unknown, _options: unknown) {}
    setBlendFunc() {}
  }

  class Mesh {
    constructor(_gl: unknown, _options: unknown) {}
  }

  class Triangle {}

  return { Geometry, Renderer, Texture, RenderTarget, Program, Mesh, Triangle };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const WIDTH = 600;
const HEIGHT = 300;
const FRAME = 16;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  ogl.attributes = null;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(props: { autoplay?: boolean; autoplayInterval?: number; idleDelay?: number }) {
  act(() =>
    root.render(
      <RippleDistortion brushSize={150} autoplayInterval={2600} fade={2.6} {...props} />,
    ),
  );
  const mount = container.querySelector('div');
  if (!mount) throw new Error('RippleDistortion 未渲染挂载节点');
  mount.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: WIDTH,
      bottom: HEIGHT,
      width: WIDTH,
      height: HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function attribute(name: 'iOpacity' | 'iScale'): Float32Array {
  if (!ogl.attributes) throw new Error('几何体属性尚未创建');
  return ogl.attributes[name].data;
}

function activeWaves(): number[] {
  return Array.from(attribute('iOpacity'))
    .map((value, index) => (value > 0.002 ? index : -1))
    .filter((index) => index >= 0);
}

function widthOf(index: number): number {
  return attribute('iScale')[index * 2];
}

function pointer(type: 'pointermove' | 'pointerdown', clientX: number, clientY: number) {
  const event = new Event(type) as Event & { clientX: number; clientY: number };
  event.clientX = clientX;
  event.clientY = clientY;
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('RippleDistortion 定时涟漪与指针优先权', () => {
  it('开启 autoplay 后空闲也会按节奏发出涟漪', () => {
    render({ autoplay: true, autoplayInterval: 1000, idleDelay: 400 });

    advance(300);
    expect(activeWaves()).toHaveLength(0);

    advance(300);
    expect(activeWaves().length).toBeGreaterThan(0);
  });

  it('关闭 autoplay 时空闲不发出任何涟漪', () => {
    render({ autoplay: false, autoplayInterval: 1000, idleDelay: 400 });

    advance(5000);

    expect(activeWaves()).toHaveLength(0);
  });

  it('一次定时水波只发一圈，不叠出第二圈', () => {
    render({ autoplay: true, autoplayInterval: 10000, idleDelay: 400 });

    advance(400 + FRAME);
    expect(activeWaves()).toHaveLength(1);

    // 再等一圈的时间也不该出现第二实例：多圈叠加会被看成抖动而不是扩散
    advance(1000);
    expect(activeWaves()).toHaveLength(1);
  });

  it('指针在场时定时涟漪让位，指针离开后才恢复', () => {
    render({ autoplay: true, autoplayInterval: 1000, idleDelay: 400 });

    pointer('pointermove', 300, 150);
    advance(FRAME);
    expect(activeWaves().length).toBeGreaterThan(0);

    // 这一波涟漪完全衰减后，再推进多个定时周期也不该出现新的自动涟漪
    advance(3000);
    expect(activeWaves()).toHaveLength(0);
    advance(6000);
    expect(activeWaves()).toHaveLength(0);

    pointer('pointermove', 4000, 4000);
    advance(300);
    expect(activeWaves()).toHaveLength(0);
    advance(400);
    expect(activeWaves().length).toBeGreaterThan(0);
  });

  it('hover 模式下点击立刻发出更大一圈的涟漪', () => {
    render({ autoplay: true, autoplayInterval: 1000, idleDelay: 400 });

    pointer('pointermove', 300, 150);
    advance(FRAME);
    const hover = activeWaves();
    expect(hover).toHaveLength(1);
    const hoverWidth = widthOf(hover[0]);

    advance(3000);
    expect(activeWaves()).toHaveLength(0);

    pointer('pointerdown', 300, 150);
    advance(FRAME);
    const clicked = activeWaves();
    expect(clicked).toHaveLength(1);
    // clickStrength=2：同一 brushSize 下点击涟漪的直径是悬停涟漪的两倍
    expect(widthOf(clicked[0]) / hoverWidth).toBeGreaterThan(1.8);
  });
});