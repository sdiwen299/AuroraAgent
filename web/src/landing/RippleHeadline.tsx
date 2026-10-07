import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import RippleDistortion from './RippleDistortion';
import styles from './RippleHeadline.module.css';

interface Props {
  /** 标题 className，保持真实 h1 的排版与无障碍语义。 */
  className?: string;
  children: ReactNode;
  brushSize?: number;
  strength?: number;
  swirl?: number;
  rings?: number;
  spread?: number;
  fade?: number;
  spacing?: number;
  glint?: number;
  tint?: string;
  tintAmount?: number;
  highlightColor?: string;
  autoplay?: boolean;
  autoplayInterval?: number;
  autoplayDelay?: number;
  autoplayStrength?: number;
  autoplayFade?: number;
  enabled?: boolean;
}

interface Run {
  text: string;
  x: number;
  y: number;
  font: string;
  letterSpacing: string;
  color: string;
}

interface Overlay {
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  clip: Array<[number, number]> | null;
}

const MAX_DPR = 2;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function toFractions(value: string, size: number): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'auto' || trimmed === 'none') return null;
  const n = Number.parseFloat(trimmed);
  if (Number.isNaN(n)) return null;
  return trimmed.endsWith('%') ? n / 100 : size === 0 ? 0 : n / size;
}

function parsePolygon(value: string): Array<[number, number]> | null {
  const match = /polygon\(([^)]*)\)/.exec(value);
  if (!match) return null;
  const points: Array<[number, number]> = [];
  for (const pair of match[1].split(',')) {
    const parts = pair.trim().split(/\s+/);
    const x = Number.parseFloat(parts[0]);
    const y = Number.parseFloat(parts[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    points.push([
      parts[0].endsWith('%') ? x / 100 : x,
      parts[1].endsWith('%') ? y / 100 : y,
    ]);
  }
  return points.length >= 3 ? points : null;
}

function parseRotate(value: string): number {
  const matrix = /matrix\(([^)]*)\)/.exec(value);
  if (matrix) {
    const parts = matrix[1].split(',').map((p) => Number.parseFloat(p));
    if (!Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return Math.atan2(parts[1], parts[0]);
    }
  }
  const deg = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(value);
  return deg ? (Number.parseFloat(deg[1]) * Math.PI) / 180 : 0;
}

/** 把 ::before 覆盖层（颜色块、高亮、贴纸等）换算到画布坐标。 */
function collectOverlays(root: HTMLElement, originX: number, originY: number): Overlay[] {
  const overlays: Overlay[] = [];
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

  for (const element of elements) {
    const base = getComputedStyle(element);
    if (base.display === 'none' || base.visibility === 'hidden') continue;
    const pseudo = getComputedStyle(element, '::before');
    if (!pseudo || pseudo.content === 'none' || pseudo.content === 'normal') continue;

    const color = pseudo.backgroundColor;
    if (!color || /rgba?\([^)]*,\s*0(\.0+)?\s*\)/.test(color)) continue;
    if (pseudo.backgroundImage !== 'none') continue;

    const box = element.getBoundingClientRect();
    // 绝对定位的包含块是 padding box，即 border box 去掉 border。
    const borderLeft = Number.parseFloat(base.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(base.borderTopWidth) || 0;
    const containingLeft = box.left + borderLeft;
    const containingTop = box.top + borderTop;
    const containingWidth = box.width - borderLeft - (Number.parseFloat(base.borderRightWidth) || 0);
    const containingHeight = box.height - borderTop - (Number.parseFloat(base.borderBottomWidth) || 0);

    const left = toFractions(pseudo.left, containingWidth) ?? 0;
    const top = toFractions(pseudo.top, containingHeight) ?? 0;
    const right = toFractions(pseudo.right, containingWidth) ?? 0;
    const height = toFractions(pseudo.height, containingHeight) ?? 0;

    const overlay: Overlay = {
      color,
      left: containingLeft + left * containingWidth - originX,
      top: containingTop + top * containingHeight - originY,
      width: Math.max(0, (1 - left - right) * containingWidth),
      height: Math.max(0, height * containingHeight),
      rotate: parseRotate(pseudo.transform),
      clip: parsePolygon(pseudo.clipPath),
    };
    if (overlay.width > 0 && overlay.height > 0) overlays.push(overlay);
  }

  return overlays;
}

/** 用 Range 反推每行文字的真实排版位置，避免手工复刻 line-height 与 letter-spacing。 */
function collectRuns(root: HTMLElement, originX: number, originY: number): Run[] {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const text = textNode.textContent ?? '';
    if (text.trim() === '') continue;

    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let start = -1;
    let top = 0;

    for (let i = 0; i <= text.length; i += 1) {
      const lineTop =
        i < text.length
          ? (() => {
              range.setStart(textNode, i);
              range.setEnd(textNode, i + 1);
              return Math.round(range.getBoundingClientRect().top * 4) / 4;
            })()
          : Number.NaN;

      if (start >= 0 && lineTop !== top) {
        range.setStart(textNode, start);
        range.setEnd(textNode, i);
        const rect = range.getBoundingClientRect();
        runs.push({
          text: text.slice(start, i),
          x: rect.left - originX,
          y: rect.top - originY,
          font,
          letterSpacing: cs.letterSpacing,
          color: cs.color,
        });
        start = -1;
      }

      if (start < 0 && i < text.length) {
        start = i;
        top = lineTop;
      }
    }
  }

  return runs;
}

/**
 * 涟漪失真标题：静止时是真实 h1（CSS 排版、可选中、可读屏），
 * hover 或定时波纹生效时把同一段文字烘到纹理上交给 WebGL 做涟漪位移。
 * WebGL 不可用时保持静止呈现。
 */
export default function RippleHeadline({
  className = '',
  children,
  brushSize = 150,
  strength = 0.055,
  swirl = 1,
  rings = 4,
  spread = 4,
  fade = 2.6,
  spacing = 14,
  glint = 0.12,
  tint = '#d8c14a',
  tintAmount = 0.16,
  highlightColor = '#f7dc35',
  autoplay = false,
  autoplayInterval = 4600,
  autoplayDelay = 2400,
  autoplayStrength = 0.62,
  autoplayFade = 2800,
  enabled = true,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (canvasRef.current === null && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
  }

  const [revision, setRevision] = useState(0);
  const [webglReady, setWebglReady] = useState(false);
  const [autoActive, setAutoActive] = useState(false);

  const paint = useCallback(() => {
    const heading = headingRef.current;
    const canvas = canvasRef.current;
    if (!heading || !canvas) return;

    const box = heading.getBoundingClientRect();
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    if (width < 2 || height < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const overlay of collectOverlays(heading, box.left, box.top)) {
      ctx.save();
      const cx = overlay.left + overlay.width / 2;
      const cy = overlay.top + overlay.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(overlay.rotate);
      ctx.translate(-cx, -cy);
      ctx.beginPath();
      if (overlay.clip) {
        overlay.clip.forEach(([fx, fy], index) => {
          const px = overlay.left + fx * overlay.width;
          const py = overlay.top + fy * overlay.height;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
      } else {
        ctx.rect(overlay.left, overlay.top, overlay.width, overlay.height);
      }
      ctx.closePath();
      ctx.fillStyle = overlay.color;
      ctx.fill();
      ctx.restore();
    }

    const supportsLetterSpacing = 'letterSpacing' in ctx;
    for (const run of collectRuns(heading, box.left, box.top)) {
      ctx.save();
      ctx.font = run.font;
      if (supportsLetterSpacing && run.letterSpacing !== 'normal') {
        ctx.letterSpacing = run.letterSpacing;
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = run.color;
      const ascent = ctx.measureText(run.text).fontBoundingBoxAscent;
      ctx.fillText(run.text, run.x, run.y + ascent);
      ctx.restore();
    }

    setRevision((value) => value + 1);
  }, []);

  const handleReady = useCallback((ok: boolean) => {
    // 用户要求减弱动效时不启用交接：换成 canvas 只会损失字形锐度，没有任何动效收益。
    if (ok && prefersReducedMotion()) return;
    setWebglReady(ok);
  }, []);

  const handleActiveChange = useCallback((active: boolean) => {
    setAutoActive(active);
  }, []);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(heading);
    void document.fonts?.ready.then(schedule).catch(() => undefined);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [paint]);

  return (
    <h1
      ref={headingRef}
      className={`${className} ${styles.wrap} ${webglReady ? styles.wrapReady : ''} ${
        webglReady && autoActive ? styles.wrapActive : ''
      }`.trim()}
    >
      <span className={styles.text}>{children}</span>
      <span className={styles.canvas} aria-hidden="true">
        <RippleDistortion
          texture={canvasRef.current}
          textureRevision={revision}
          brushSize={brushSize}
          strength={strength}
          swirl={swirl}
          rings={rings}
          spread={spread}
          fade={fade}
          spacing={spacing}
          glint={glint}
          tint={tint}
          tintAmount={tintAmount}
          highlightColor={highlightColor}
          autoplay={autoplay}
          autoplayInterval={autoplayInterval}
          autoplayDelay={autoplayDelay}
          autoplayStrength={autoplayStrength}
          autoplayFade={autoplayFade}
          enabled={enabled}
          onReady={handleReady}
          onActiveChange={handleActiveChange}
        />
      </span>
    </h1>
  );
}
