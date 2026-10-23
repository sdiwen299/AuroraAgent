import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import './TechText.css';

type Reveal = 'letter' | 'area';
type LineStyle = 'dashed' | 'solid';

interface Glyph {
  char: string;
  x: number;
  box: { x1: number; y1: number; x2: number; y2: number };
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
  outline: number;
  index: number;
  fill: Sprite;
  dashes: Sprite;
}

interface Sprite {
  image: HTMLCanvasElement;
  left: number;
  top: number;
}

interface WordBox {
  size: number;
  baseline: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Settings {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  color: string;
  accentColor: string;
  reach: number;
  softness: number;
  dashLength: number;
  dashGap: number;
  strokeWidth: number;
  lineStyle: LineStyle;
  reveal: Reveal;
  specks: number;
  selection: boolean;
  labels: boolean;
  draggable: boolean;
  sweep: boolean;
  speed: number;
}

export interface TechTextProps {
  text: string;
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  letterSpacing?: number;
  color?: string;
  accentColor?: string;
  reach?: number;
  softness?: number;
  dashLength?: number;
  dashGap?: number;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  reveal?: Reveal;
  specks?: number;
  selection?: boolean;
  labels?: boolean;
  draggable?: boolean;
  sweep?: boolean;
  speed?: number;
  /** 视觉装饰用途：隐藏内部文本，由调用方（如标题）提供可读文案 */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FALLOFF_STEPS = 8;
const SPRING = 320;
const DAMPING = 22;

type SpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

const approach = (current: number, target: number, dt: number, seconds: number) =>
  current + (target - current) * (1 - Math.exp(-dt / seconds));

const hexToRgb = (hex: string): [number, number, number] => {
  let clean = String(hex || '').replace('#', '');
  if (clean.length === 3) clean = clean.replace(/./g, (char) => char + char);
  const value = parseInt(clean.slice(0, 6), 16);
  return Number.isNaN(value)
    ? [255, 255, 255]
    : [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const noise = (...values: number[]) => {
  let hash = 2166136261;
  for (const value of values) {
    hash = Math.imul(hash ^ (value | 0), 16777619);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0x5bd1e995);
    hash ^= hash >>> 15;
  }
  return (hash >>> 0) / 4294967296;
};

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');

/**
 * 技术感文字：canvas 逐字渲染 + 虚线描边显影 + 字粒光标扫掠。
 * canvas 不可用时保留 fallback 文本，语义由 decorative 决定。
 */
export default function TechText({
  text = '',
  fontFamily = '',
  fontWeight = 700,
  fontSize = 96,
  letterSpacing = -0.04,
  color = '#20340f',
  accentColor = '#9f3410',
  reach = 200,
  softness = 0.7,
  dashLength = 4,
  dashGap = 3,
  strokeWidth = 1.5,
  lineStyle = 'dashed',
  reveal = 'letter',
  specks = 12,
  selection = true,
  labels = false,
  draggable = true,
  sweep = true,
  speed = 1,
  decorative = false,
  className = '',
  style,
}: TechTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<Settings | null>(null);
  const wakeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    settingsRef.current = {
      text,
      fontFamily,
      fontWeight,
      fontSize,
      letterSpacing,
      color,
      accentColor,
      reach,
      softness,
      dashLength,
      dashGap,
      strokeWidth,
      lineStyle,
      reveal,
      specks,
      selection,
      labels,
      draggable,
      sweep,
      speed,
    };
    wakeRef.current();
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const scratch = document.createElement('canvas');
    const scratchCtx = scratch.getContext('2d');
    if (!container || !canvas || !ctx || !scratchCtx) return undefined;

    container.dataset.canvasReady = 'true';

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    let alive = true;
    let layoutKey = '';
    let requestedFont = '';
    let word: WordBox | null = null;
    let glyphs: Glyph[] = [];
    let presence = 0;
    let clock = 0;
    let pulse = 0;
    let placed = false;
    let dragging = -1;
    const pointer = { x: 0, y: 0, inside: false };
    const grab = { x: 0, y: 0 };
    const lens = { x: 0, y: 0 };
    const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    const refreshFonts = () => {
      layoutKey = '';
      wakeRef.current();
    };

    const family = (settings: Settings) =>
      settings.fontFamily || getComputedStyle(container).fontFamily || 'sans-serif';
    const fontFor = (settings: Settings, size: number) =>
      `${settings.fontWeight} ${size}px ${family(settings)}`;

    const setFont = (target: CanvasRenderingContext2D, settings: Settings, size: number) => {
      target.font = fontFor(settings, size);
      if ('letterSpacing' in target) {
        (target as SpacedContext).letterSpacing = `${settings.letterSpacing * size}px`;
      }
      target.textAlign = 'left';
      target.textBaseline = 'alphabetic';
    };

    const sprite = (settings: Settings, view: WordBox, glyph: Glyph, stroke: boolean): Sprite => {
      const pad = Math.ceil(settings.strokeWidth * 2 + 4);
      const left = glyph.box.x1 - pad;
      const top = glyph.box.y1 - pad;
      const spriteWidth = glyph.box.x2 - glyph.box.x1 + pad * 2;
      const spriteHeight = glyph.box.y2 - glyph.box.y1 + pad * 2;
      const image = document.createElement('canvas');
      image.width = Math.max(1, Math.ceil(spriteWidth * dpr));
      image.height = Math.max(1, Math.ceil(spriteHeight * dpr));
      const context = image.getContext('2d');
      if (!context) return { image, left, top };
      context.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(context, settings, view.size);
      if (stroke) {
        context.lineJoin = 'round';
        context.lineWidth = settings.strokeWidth * 2;
        context.lineCap = 'butt';
        context.strokeStyle = settings.color;
        if (settings.lineStyle !== 'solid') {
          context.setLineDash([Math.max(1, settings.dashLength), Math.max(1, settings.dashGap)]);
        }
        context.strokeText(glyph.char, glyph.x, view.baseline);
        context.setLineDash([]);
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = '#000000';
        context.fillText(glyph.char, glyph.x, view.baseline);
        context.globalCompositeOperation = 'source-over';
      } else {
        context.fillStyle = settings.color;
        context.fillText(glyph.char, glyph.x, view.baseline);
      }
      return { image, left, top };
    };

    const ensureLayout = (settings: Settings) => {
      const key = [
        settings.text,
        family(settings),
        settings.fontWeight,
        settings.fontSize,
        settings.letterSpacing,
        settings.color,
        settings.dashLength,
        settings.dashGap,
        settings.strokeWidth,
        settings.lineStyle,
        width,
        height,
        dpr,
      ].join('|');
      if (key === layoutKey && word) return word;
      layoutKey = key;

      const wanted = fontFor(settings, 64);
      if (document.fonts && wanted !== requestedFont) {
        requestedFont = wanted;
        document.fonts.load(wanted, settings.text).then(refreshFonts, refreshFonts);
      }

      const probe = scratchCtx;
      setFont(probe, settings, settings.fontSize);
      let metrics = probe.measureText(settings.text);
      const fit = Math.min(
        1,
        (width * 0.9) / Math.max(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight, 1),
        (height * 0.72) / Math.max(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent, 1),
      );
      const size = settings.fontSize * fit;
      setFont(probe, settings, size);
      metrics = probe.measureText(settings.text);
      const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
      const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      const x = (width - inkWidth) / 2 + metrics.actualBoundingBoxLeft;
      const baseline = (height - inkHeight) / 2 + metrics.actualBoundingBoxAscent;
      const next: WordBox = {
        size,
        baseline,
        left: x - metrics.actualBoundingBoxLeft,
        right: x + metrics.actualBoundingBoxRight,
        top: baseline - metrics.actualBoundingBoxAscent,
        bottom: baseline + metrics.actualBoundingBoxDescent,
      };
      word = next;

      const previous = glyphs;
      glyphs = [];
      let prefix = '';
      Array.from(settings.text).forEach((char, index) => {
        prefix += char;
        const own = probe.measureText(char);
        const glyphX = x + probe.measureText(prefix).width - own.width;
        if (!char.trim()) return;
        const base: Glyph = {
          char,
          x: glyphX,
          box: {
            x1: glyphX - own.actualBoundingBoxLeft,
            y1: baseline - own.actualBoundingBoxAscent,
            x2: glyphX + own.actualBoundingBoxRight,
            y2: baseline + own.actualBoundingBoxDescent,
          },
          offset: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          outline: 0,
          index,
          fill: { image: canvas, left: 0, top: 0 },
          dashes: { image: canvas, left: 0, top: 0 },
        };
        const kept = previous[glyphs.length];
        const glyph: Glyph = {
          ...base,
          offset: kept?.char === char ? kept.offset : { x: 0, y: 0 },
        };
        glyph.fill = sprite(settings, next, glyph, false);
        glyph.dashes = sprite(settings, next, glyph, true);
        glyphs.push(glyph);
      });
      dragging = -1;
      frame.index = -1;
      return next;
    };

    const glyphAt = (x: number, y: number) => {
      if (!word || y < word.top - 24 || y > word.bottom + 24) return -1;
      let best = -1;
      let bestDistance = Infinity;
      glyphs.forEach((glyph, index) => {
        const x1 = glyph.box.x1 + glyph.offset.x;
        const x2 = glyph.box.x2 + glyph.offset.x;
        const distance = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return bestDistance < 28 ? best : -1;
    };

    const falloff = (
      target: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      radius: number,
      strength: number,
      softness: number,
    ) => {
      const inner = Math.min(1, Math.max(0, 1 - softness));
      const gradient = target.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      if (inner > 0.995) {
        gradient.addColorStop(0.995, `rgba(0, 0, 0, ${strength})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        return gradient;
      }
      for (let i = 0; i <= FALLOFF_STEPS; i += 1) {
        const t = i / FALLOFF_STEPS;
        const eased = t * t * (3 - 2 * t);
        gradient.addColorStop(inner + (1 - inner) * t, `rgba(0, 0, 0, ${strength * (1 - eased)})`);
      }
      return gradient;
    };

    const blit = (target: CanvasRenderingContext2D, art: Sprite, dx: number, dy: number, originX: number, originY: number) => {
      target.drawImage(
        art.image,
        Math.round((art.left + dx) * dpr - originX),
        Math.round((art.top + dy) * dpr - originY),
      );
    };

    const drawReveal = (settings: Settings) => {
      const radius = settings.reach * dpr;
      const cx = lens.x * dpr;
      const cy = lens.y * dpr;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, settings.softness);
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.globalCompositeOperation = 'source-over';

      const x0 = Math.max(0, Math.floor(cx - radius));
      const y0 = Math.max(0, Math.floor(cy - radius));
      const x1 = Math.min(canvas.width, Math.ceil(cx + radius));
      const y1 = Math.min(canvas.height, Math.ceil(cy + radius));
      if (x1 <= x0 || y1 <= y0) return;
      const regionWidth = x1 - x0;
      const regionHeight = y1 - y0;
      if (scratch.width < regionWidth || scratch.height < regionHeight) {
        scratch.width = Math.max(scratch.width, regionWidth);
        scratch.height = Math.max(scratch.height, regionHeight);
      }
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.clearRect(0, 0, regionWidth, regionHeight);
      glyphs.forEach((glyph) => blit(scratchCtx, glyph.dashes, glyph.offset.x, glyph.offset.y, x0, y0));
      scratchCtx.globalCompositeOperation = 'destination-in';
      scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, settings.softness);
      scratchCtx.fillRect(0, 0, regionWidth, regionHeight);
      scratchCtx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = presence;
      ctx.drawImage(scratch, 0, 0, regionWidth, regionHeight, x0, y0, regionWidth, regionHeight);
      ctx.globalAlpha = 1;
    };

    const crisp = (value: number) => (Math.round(value * dpr) + 0.5) / dpr;

    const perimeterPoint = (distance: number, boxWidth: number, boxHeight: number): [number, number, number, number] => {
      let remaining = ((distance % (2 * (boxWidth + boxHeight))) + 2 * (boxWidth + boxHeight)) % (2 * (boxWidth + boxHeight));
      if (remaining < boxWidth) return [frame.x1 + remaining, frame.y1, 0, -1];
      remaining -= boxWidth;
      if (remaining < boxHeight) return [frame.x2, frame.y1 + remaining, 1, 0];
      remaining -= boxHeight;
      if (remaining < boxWidth) return [frame.x2 - remaining, frame.y2, 0, 1];
      remaining -= boxWidth;
      return [frame.x1, frame.y2 - remaining, -1, 0];
    };

    const drawSpecks = (settings: Settings, alpha: number) => {
      const boxWidth = frame.x2 - frame.x1;
      const boxHeight = frame.y2 - frame.y1;
      if (boxWidth < 2 || boxHeight < 2) return;
      const perimeter = 2 * (boxWidth + boxHeight);
      const seed = frame.index + 1;
      const grid = 3;

      for (let k = 0; k < settings.specks; k += 1) {
        const period = 0.5 + noise(seed, k, 11) * 1.2;
        const t = pulse / period + noise(seed, k, 17);
        const cycle = Math.floor(t);
        const life = t - cycle;
        if (life > 0.7) continue;
        const [px, py, nx, ny] = perimeterPoint(noise(seed, k, cycle) * perimeter, boxWidth, boxHeight);
        const pick = noise(seed, k, cycle, 2);
        const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
        const large = size >= 8;
        const out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
        const x = frame.x1 + Math.round((px + nx * out - frame.x1) / grid) * grid;
        const y = frame.y1 + Math.round((py + ny * out - frame.y1) / grid) * grid;
        const tone = noise(seed, k, cycle, 3);
        const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
        const alphaValue = alpha * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
        const left = Math.round(x - size / 2);
        const top = Math.round(y - size / 2);
        if (tone < 0.26 || (large && tone < 0.78)) {
          ctx.strokeStyle = rgba(settings.accentColor, alphaValue);
          ctx.strokeRect(left + 0.5, top + 0.5, size, size);
          if (large && tone > 0.5) {
            ctx.fillStyle = rgba(settings.accentColor, alphaValue);
            ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
          }
        } else {
          ctx.fillStyle = rgba(settings.accentColor, alphaValue);
          ctx.fillRect(left, top, size, size);
        }
      }

      for (let j = 0; j < 2; j += 1) {
        const head = (pulse * 0.42 * settings.speed + j * 0.5) * perimeter;
        for (let i = 0; i < 4; i += 1) {
          const [x, y] = perimeterPoint(head - i * 6, boxWidth, boxHeight);
          const size = i === 0 ? 3 : 2;
          ctx.fillStyle = rgba(settings.accentColor, alpha * [0.95, 0.55, 0.32, 0.16][i]);
          ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
        }
      }
    };

    const drawFrame = (settings: Settings) => {
      const glyph = glyphs[frame.index];
      if (!glyph || frame.alpha < 0.01) return;
      const alpha = frame.alpha;
      const x1 = crisp(frame.x1);
      const y1 = crisp(frame.y1);
      const x2 = crisp(frame.x2);
      const y2 = crisp(frame.y2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
      if (moved > 1) {
        const hx = (glyph.box.x1 + glyph.box.x2) / 2;
        const hy = (glyph.box.y1 + glyph.box.y2) / 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + glyph.offset.x, hy + glyph.offset.y);
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(settings.accentColor, 0.45 * alpha);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
        ctx.fillStyle = rgba(settings.accentColor, 0.7 * alpha);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(settings.accentColor, 0.5 * alpha);
      ctx.stroke();

      ctx.beginPath();
      [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
      ].forEach(([cx, cy]) => {
        ctx.rect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
      });
      ctx.fillStyle = rgba(settings.accentColor, 0.95 * alpha);
      ctx.fill();

      if (settings.specks > 0) {
        ctx.lineWidth = 1;
        drawSpecks(settings, alpha);
      }

      if (!settings.labels) return;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(settings.accentColor, 0.62 * alpha);
      const label =
        moved > 1
          ? `${signed(Math.round(glyph.offset.x))}, ${signed(Math.round(-glyph.offset.y))}`
          : `${glyph.char}  ${Math.round(glyph.box.x2 - glyph.box.x1)} × ${Math.round(glyph.box.y2 - glyph.box.y1)}`;
      ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
    };

    const tick = (now: number) => {
      raf = 0;
      const settings = settingsRef.current;
      if (!settings) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const view = ensureLayout(settings);

      const sweeping = settings.sweep && !reducedMotion && !pointer.inside && dragging < 0;
      if (sweeping) clock += dt * settings.speed;
      pulse += dt;
      let targetX = pointer.x;
      let targetY = pointer.y;
      if (sweeping) {
        targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
        targetY = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
      }
      const active = pointer.inside || sweeping || dragging >= 0;
      if (active && !placed) {
        lens.x = targetX;
        lens.y = targetY;
      }
      if (active) {
        const lag = pointer.inside ? 0.05 : 0.22;
        lens.x = approach(lens.x, targetX, dt, lag);
        lens.y = approach(lens.y, targetY, dt, lag);
      }
      placed = active;
      presence = approach(presence, settings.reveal === 'area' && active && dragging < 0 ? 1 : 0, dt, 0.16);

      let moving = false;
      glyphs.forEach((glyph, index) => {
        if (index === dragging) {
          glyph.offset.x = approach(glyph.offset.x, pointer.x - grab.x, dt, 0.03);
          glyph.offset.y = approach(glyph.offset.y, pointer.y - grab.y, dt, 0.03);
          glyph.velocity.x = 0;
          glyph.velocity.y = 0;
          moving = true;
          return;
        }
        const { offset, velocity } = glyph;
        if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
          offset.x = 0;
          offset.y = 0;
          velocity.x = 0;
          velocity.y = 0;
          return;
        }
        velocity.x += (-SPRING * offset.x - DAMPING * velocity.x) * dt;
        velocity.y += (-SPRING * offset.y - DAMPING * velocity.y) * dt;
        offset.x += velocity.x * dt;
        offset.y += velocity.y * dt;
        moving = true;
      });

      const focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
      if (focus >= 0 && settings.selection) {
        const glyph = glyphs[focus];
        const bx1 = glyph.box.x1 + glyph.offset.x - 6;
        const by1 = glyph.box.y1 + glyph.offset.y - 6;
        const bx2 = glyph.box.x2 + glyph.offset.x + 6;
        const by2 = glyph.box.y2 + glyph.offset.y + 6;
        if (frame.index < 0 || frame.alpha < 0.02) {
          frame.x1 = bx1;
          frame.y1 = by1;
          frame.x2 = bx2;
          frame.y2 = by2;
        }
        const glide = focus === dragging ? 0.02 : 0.08;
        frame.x1 = approach(frame.x1, bx1, dt, glide);
        frame.y1 = approach(frame.y1, by1, dt, glide);
        frame.x2 = approach(frame.x2, bx2, dt, glide);
        frame.y2 = approach(frame.y2, by2, dt, glide);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 && settings.selection ? 1 : 0, dt, 0.1);

      glyphs.forEach((glyph, index) => {
        const target = settings.reveal === 'letter' && index === focus && index !== dragging ? 1 : 0;
        glyph.outline = approach(glyph.outline, target, dt, 0.09);
        if (Math.abs(glyph.outline - target) > 0.002) moving = true;
        else glyph.outline = target;
      });

      if (settings.draggable) {
        container.style.cursor = dragging >= 0 ? 'grabbing' : focus >= 0 && pointer.inside ? 'grab' : '';
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      glyphs.forEach((glyph) => {
        if (Math.hypot(glyph.offset.x, glyph.offset.y) > 1) {
          ctx.globalAlpha = 0.55;
          blit(ctx, glyph.dashes, 0, 0, 0, 0);
          ctx.globalAlpha = 1;
        }
      });
      glyphs.forEach((glyph) => {
        if (glyph.outline < 0.999) {
          ctx.globalAlpha = 1 - glyph.outline;
          blit(ctx, glyph.fill, glyph.offset.x, glyph.offset.y, 0, 0);
        }
        if (glyph.outline > 0.001) {
          ctx.globalAlpha = glyph.outline;
          blit(ctx, glyph.dashes, glyph.offset.x, glyph.offset.y, 0, 0);
        }
        ctx.globalAlpha = 1;
      });
      if (presence > 0.001) drawReveal(settings);
      drawFrame(settings);

      const settling =
        moving ||
        Math.abs(presence - (settings.reveal === 'area' && active && dragging < 0 ? 1 : 0)) > 0.002 ||
        (frame.alpha > 0.01 && frame.alpha < 0.99);
      if ((active || settling) && visible && alive) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const resize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      layoutKey = '';
      wake();
    };

    const locate = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };
    const handleMove = (event: PointerEvent) => {
      locate(event);
      pointer.inside = true;
      wake();
    };
    const handleLeave = () => {
      if (dragging >= 0) return;
      pointer.inside = false;
      wake();
    };
    const handleDown = (event: PointerEvent) => {
      locate(event);
      pointer.inside = true;
      const settings = settingsRef.current;
      if (settings?.draggable && (event.pointerType !== 'mouse' || event.button === 0)) {
        const index = glyphAt(pointer.x, pointer.y);
        if (index >= 0) {
          dragging = index;
          grab.x = pointer.x - glyphs[index].offset.x;
          grab.y = pointer.y - glyphs[index].offset.y;
          container.setPointerCapture?.(event.pointerId);
        }
      }
      wake();
    };
    const handleUp = (event: PointerEvent) => {
      if (dragging >= 0) {
        dragging = -1;
        container.releasePointerCapture?.(event.pointerId);
        const rect = container.getBoundingClientRect();
        pointer.inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
      }
      wake();
    };

    container.addEventListener('pointermove', handleMove, { passive: true });
    container.addEventListener('pointerenter', handleMove, { passive: true });
    container.addEventListener('pointerdown', handleDown, { passive: true });
    container.addEventListener('pointerup', handleUp, { passive: true });
    container.addEventListener('pointercancel', handleUp, { passive: true });
    container.addEventListener('pointerleave', handleLeave, { passive: true });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    intersectionObserver.observe(container);
    if (document.fonts) document.fonts.ready.then(refreshFonts, refreshFonts);

    resize();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      wakeRef.current = () => undefined;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', handleMove);
      container.removeEventListener('pointerenter', handleMove);
      container.removeEventListener('pointerdown', handleDown);
      container.removeEventListener('pointerup', handleUp);
      container.removeEventListener('pointercancel', handleUp);
      container.removeEventListener('pointerleave', handleLeave);
    };
  }, []);

  return (
    <span
      ref={containerRef}
      className={`tech-text${className ? ` ${className}` : ''}`}
      style={{ color, ...style }}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : text}
    >
      <span className="tech-text__fallback" aria-hidden="true">
        {text}
      </span>
      <canvas className="tech-text__canvas" ref={canvasRef} aria-hidden="true" />
      {!decorative && <span className="tech-text__sr">{text}</span>}
    </span>
  );
}