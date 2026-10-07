'use client';

import { useRef, useEffect } from 'react';
import './CursorGrid.css';

const FALLOFF_CURVES = {
  linear: (t: number) => t,
  smooth: (t: number) => t * t * (3 - 2 * t),
  sharp: (t: number) => t * t * t,
} as const;

type Falloff = keyof typeof FALLOFF_CURVES;

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(v.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255] as const;
};

interface CursorGridProps {
  cellSize?: number;
  color?: string;
  radius?: number;
  falloff?: Falloff | string;
  holdTime?: number;
  fadeDuration?: number;
  lineWidth?: number;
  maxOpacity?: number;
  fillOpacity?: number;
  gridOpacity?: number;
  cellRadius?: number;
  clickPulse?: boolean;
  pulseSpeed?: number;
  className?: string;
}

const CursorGrid = ({
  cellSize = 70,
  color = '#D946EF',
  radius = 140,
  falloff = 'smooth',
  holdTime = 400,
  fadeDuration = 800,
  lineWidth = 1.2,
  maxOpacity = 1,
  fillOpacity = 0,
  gridOpacity = 0,
  cellRadius = 0,
  clickPulse = true,
  pulseSpeed = 600,
  className = '',
}: CursorGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<CursorGridProps>({});
  const wakeRef = useRef<(() => void) | null>(null);

  propsRef.current = {
    cellSize,
    color,
    radius,
    falloff,
    holdTime,
    fadeDuration,
    lineWidth,
    maxOpacity,
    fillOpacity,
    gridOpacity,
    cellRadius,
    clickPulse,
    pulseSpeed,
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let cols = 0;
    let rows = 0;
    let offX = 0;
    let offY = 0;
    let alphas = new Float32Array(0);
    let touched = new Float64Array(0);
    let w = 0;
    let h = 0;
    const pulses: Array<{ x: number; y: number; t0: number }> = [];
    let raf = 0;
    let running = false;
    let lastFrame = 0;

    const rebuild = () => {
      const p = propsRef.current;
      w = container.offsetWidth;
      h = container.offsetHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const cs = p.cellSize ?? 70;
      cols = Math.ceil(w / cs) + 1;
      rows = Math.ceil(h / cs) + 1;
      offX = (w - cols * cs) / 2;
      offY = (h - rows * cs) / 2;
      alphas = new Float32Array(cols * rows);
      touched = new Float64Array(cols * rows);
    };

    const cellCenter = (i: number) => {
      const p = propsRef.current;
      const cs = p.cellSize ?? 70;
      const cx = offX + (i % cols) * cs + cs / 2;
      const cy = offY + Math.floor(i / cols) * cs + cs / 2;
      return [cx, cy] as const;
    };

    const energize = (x: number, y: number, boost?: number) => {
      const p = propsRef.current;
      const r = Math.max(p.radius ?? 140, 1);
      const falloffKey = p.falloff as Falloff;
      const ease = FALLOFF_CURVES[falloffKey] ?? FALLOFF_CURVES.linear;
      const now = performance.now();
      const cs = p.cellSize ?? 70;
      const minCol = Math.max(0, Math.floor((x - r - offX) / cs));
      const maxCol = Math.min(cols - 1, Math.floor((x + r - offX) / cs));
      const minRow = Math.max(0, Math.floor((y - r - offY) / cs));
      const maxRow = Math.min(rows - 1, Math.floor((y + r - offY) / cs));
      for (let cRow = minRow; cRow <= maxRow; cRow++) {
        for (let cCol = minCol; cCol <= maxCol; cCol++) {
          const i = cRow * cols + cCol;
          const [cx, cy] = cellCenter(i);
          const dist = Math.hypot(cx - x, cy - y);
          if (dist > r) continue;
          const level = ease(1 - dist / r) * (p.maxOpacity ?? 1) * (boost ?? 1);
          if (level > alphas[i]) {
            alphas[i] = level;
            touched[i] = now;
          } else if (level > 0) {
            touched[i] = now;
          }
        }
      }
    };

    const draw = (now: number) => {
      if (!ctx) return;
      const p = propsRef.current;
      const dt = Math.min(now - lastFrame, 50);
      lastFrame = now;
      ctx.clearRect(0, 0, w, h);
      const [cr, cg, cb] = hexToRgb(p.color ?? '#D946EF');

      if ((p.gridOpacity ?? 0) > 0) {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${p.gridOpacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cs = p.cellSize ?? 70;
        for (let cCol = 0; cCol <= cols; cCol++) {
          const x = Math.round(offX + cCol * cs) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let cRow = 0; cRow <= rows; cRow++) {
          const y = Math.round(offY + cRow * cs) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      }

      const cs = p.cellSize ?? 70;
      for (let pi = pulses.length - 1; pi >= 0; pi--) {
        const pulse = pulses[pi];
        const age = (now - pulse.t0) / 1000;
        const ringR = age * (p.pulseSpeed ?? 600);
        if (ringR > Math.hypot(w, h)) {
          pulses.splice(pi, 1);
          continue;
        }
        const band = cs;
        const minCol = Math.max(0, Math.floor((pulse.x - ringR - band - offX) / cs));
        const maxCol = Math.min(cols - 1, Math.floor((pulse.x + ringR + band - offX) / cs));
        const minRow = Math.max(0, Math.floor((pulse.y - ringR - band - offY) / cs));
        const maxRow = Math.min(rows - 1, Math.floor((pulse.y + ringR + band - offY) / cs));
        for (let cRow = minRow; cRow <= maxRow; cRow++) {
          for (let cCol = minCol; cCol <= maxCol; cCol++) {
            const i = cRow * cols + cCol;
            const [cx, cy] = cellCenter(i);
            const dist = Math.hypot(cx - pulse.x, cy - pulse.y);
            if (Math.abs(dist - ringR) < band / 2 && (p.maxOpacity ?? 1) > alphas[i]) {
              alphas[i] = p.maxOpacity ?? 1;
              touched[i] = now;
            }
          }
        }
      }

      let anyVisible = pulses.length > 0;
      const fadeStep = dt / Math.max(p.fadeDuration ?? 800, 16);
      const half = cs / 2;

      for (let i = 0; i < alphas.length; i++) {
        let a = alphas[i];
        if (a <= 0) continue;
        if (now - touched[i] > (p.holdTime ?? 400)) {
          a = Math.max(0, a - fadeStep);
          alphas[i] = a;
          if (a <= 0) continue;
        }
        anyVisible = true;

        const [cx, cy] = cellCenter(i);
        const gradient = ctx.createRadialGradient(cx, cy, half * 0.1, cx, cy, cs);
        gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
        gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

        const x = cx - half + 0.5;
        const y = cy - half + 0.5;
        const s = cs - 1;

        ctx.beginPath();
        const cellR = p.cellRadius ?? 0;
        if (cellR > 0) {
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(x, y, s, s, cellR);
          } else {
            const r = cellR;
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + s, y, x + s, y + s, r);
            ctx.arcTo(x + s, y + s, x, y + s, r);
            ctx.arcTo(x, y + s, x, y, r);
            ctx.arcTo(x, y, x + s, y, r);
            ctx.closePath();
          }
        } else {
          ctx.rect(x, y, s, s);
        }

        if ((p.fillOpacity ?? 0) > 0) {
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${a * (p.fillOpacity ?? 0)})`;
          ctx.fill();
        }
        ctx.strokeStyle = gradient;
        ctx.lineWidth = p.lineWidth ?? 1.2;
        ctx.stroke();
      }

      if (anyVisible) {
        raf = requestAnimationFrame(draw);
      } else {
        running = false;
        if ((propsRef.current.gridOpacity ?? 0) <= 0) {
          ctx.clearRect(0, 0, w, h);
        }
      }
    };

    const wake = () => {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(draw);
    };
    wakeRef.current = wake;

    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return [clientX - rect.left, clientY - rect.top] as const;
    };

    // The grid is decorative, but it should only react while the pointer is
    // actually inside the hero instead of leaking into nearby content.
    const withinBounds = (x: number, y: number) => {
      return x >= 0 && x <= w && y >= 0 && y <= h;
    };

    // The container has `pointer-events: none` so it sits behind the hero
    // content without swallowing clicks, which also means it can never be an
    // event target. Listen on `window` instead and map into canvas space.
    const onPointerMove = (e: PointerEvent) => {
      const [x, y] = toLocal(e.clientX, e.clientY);
      if (!withinBounds(x, y)) return;
      energize(x, y);
      wake();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!propsRef.current.clickPulse) return;
      const [x, y] = toLocal(e.clientX, e.clientY);
      if (!withinBounds(x, y)) return;
      pulses.push({ x, y, t0: performance.now() });
      wake();
    };

    const ro = new ResizeObserver(() => {
      rebuild();
      wake();
    });
    ro.observe(container);
    rebuild();
    wake();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellSize]);

  useEffect(() => {
    wakeRef.current?.();
  }, [gridOpacity, color, lineWidth, maxOpacity, fillOpacity, cellRadius]);

  return (
    <div ref={containerRef} className={`cursor-grid${className ? ` ${className}` : ''}`}>
      <canvas ref={canvasRef} className="cursor-grid__canvas" />
    </div>
  );
};

export default CursorGrid;
