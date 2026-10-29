import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import './DriftWall.css';

export interface DriftWallItem {
  image: string;
  title?: string;
  href?: string;
  onClick?: () => void;
}

export interface DriftWallProps {
  items: DriftWallItem[];
  columns?: number;
  tileWidth?: number;
  tileHeight?: number;
  gap?: number;
  radius?: number;
  tilt?: number;
  turn?: number;
  roll?: number;
  perspective?: number;
  depth?: number;
  speed?: number;
  direction?: 'up' | 'down';
  variance?: number;
  parallax?: number;
  pauseOnHover?: boolean;
  lift?: number;
  fade?: number;
  dim?: number;
  grayscale?: boolean;
  overlayColor?: string;
  className?: string;
  style?: CSSProperties;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const columnFactor = (index: number, variance: number) => {
  const pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
  return 1 + variance * pseudo;
};

export default function DriftWall({
  items,
  columns = 5,
  tileWidth = 200,
  tileHeight = 132,
  gap = 18,
  radius = 14,
  tilt = 16,
  turn = -14,
  roll = 0,
  perspective = 1200,
  depth = 120,
  speed = 42,
  direction = 'up',
  variance = 0.45,
  parallax = 0.6,
  pauseOnHover = false,
  lift = 64,
  fade = 0.6,
  dim = 0.55,
  grayscale = false,
  overlayColor = '#060010',
  className = '',
  style,
}: DriftWallProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const offsetsRef = useRef<number[]>([]);
  const velocitiesRef = useRef<number[]>([]);
  const hoveredColRef = useRef(-1);
  const wallHoveredRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const pointerDampedRef = useRef({ x: 0, y: 0 });
  const lastTsRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const [containerHeight, setContainerHeight] = useState(600);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const columnItems = useMemo(() => {
    const safeColumns = Math.max(1, Math.floor(columns));
    const cols = Array.from({ length: safeColumns }, () => [] as DriftWallItem[]);
    items.forEach((item, index) => cols[index % safeColumns].push(item));
    return cols.filter((column) => column.length > 0);
  }, [items, columns]);

  const columnMeta = useMemo(() => {
    const unit = tileHeight + gap;
    return columnItems.map((column) => {
      const copyHeight = Math.max(unit, column.length * unit);
      const copies = Math.max(2, Math.ceil((containerHeight * 1.6) / copyHeight) + 1);
      return { copyHeight, copies };
    });
  }, [columnItems, tileHeight, gap, containerHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height || 600));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const baseVelocities = useMemo(() => {
    const dirSign = direction === 'up' ? 1 : -1;
    return columnItems.map((_, index) => {
      const altSign = index % 2 === 0 ? 1 : -1;
      return speed * columnFactor(index, variance) * dirSign * altSign;
    });
  }, [columnItems, speed, direction, variance]);

  useEffect(() => {
    offsetsRef.current = columnMeta.map((meta, index) => meta.copyHeight * ((index * 0.37) % 1));
    velocitiesRef.current = columnItems.map(() => 0);
  }, [columnMeta, columnItems]);

  const applyPlaneTransform = useCallback(
    (px: number, py: number) => {
      if (!planeRef.current) return;
      planeRef.current.style.transform =
        `translate(-50%, -50%) scale(1.18) rotateX(${tilt + py}deg) ` +
        `rotateY(${turn + px}deg) rotateZ(${roll}deg) translateZ(${-depth}px)`;
    },
    [tilt, turn, roll, depth],
  );

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (lastTsRef.current === null) lastTsRef.current = timestamp;
      const dt = Math.min(0.05, Math.max(0, timestamp - lastTsRef.current) / 1000);
      lastTsRef.current = timestamp;

      const maxTilt = parallax * 8;
      const targetX = pointerRef.current.x * maxTilt;
      const targetY = -pointerRef.current.y * maxTilt;
      const damp = 1 - Math.exp(-dt / 0.12);
      pointerDampedRef.current.x += (targetX - pointerDampedRef.current.x) * damp;
      pointerDampedRef.current.y += (targetY - pointerDampedRef.current.y) * damp;
      applyPlaneTransform(pointerDampedRef.current.x, pointerDampedRef.current.y);

      columnMeta.forEach((meta, index) => {
        const track = trackRefs.current[index];
        if (!track) return;
        if (!reduced) {
          const paused = wallHoveredRef.current && pauseOnHover;
          const target = baseVelocities[index] * (paused || hoveredColRef.current === index ? 0 : 1);
          const ease = 1 - Math.exp(-dt / (target === 0 ? 0.16 : 0.28));
          velocitiesRef.current[index] += (target - velocitiesRef.current[index]) * ease;
          const next = ((offsetsRef.current[index] + velocitiesRef.current[index] * dt) % meta.copyHeight + meta.copyHeight) % meta.copyHeight;
          offsetsRef.current[index] = next;
        }
        track.style.transform = `translate3d(0, ${-(offsetsRef.current[index] ?? 0)}px, 0)`;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [applyPlaneTransform, baseVelocities, columnMeta, parallax, pauseOnHover, reduced]);

  const activate = useCallback((id: string, column: number) => {
    activeIdRef.current = id;
    hoveredColRef.current = column;
    setActiveId(id);
  }, []);

  const release = useCallback(() => {
    activeIdRef.current = null;
    hoveredColRef.current = -1;
    setActiveId(null);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (parallax > 0 && !reduced) {
        pointerRef.current = {
          x: (event.clientX - rect.left) / rect.width - 0.5,
          y: (event.clientY - rect.top) / rect.height - 0.5,
        };
      }
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const tile = hit?.closest<HTMLElement>('[data-tile-id]');
      if (!tile) return;
      const id = tile.dataset.tileId;
      if (!id || id === activeIdRef.current) return;
      activate(id, Number(tile.dataset.col ?? -1));
    },
    [activate, parallax, reduced],
  );

  const handlePointerLeave = useCallback(() => {
    wallHoveredRef.current = false;
    pointerRef.current = { x: 0, y: 0 };
    release();
  }, [release]);

  const cssVars = useMemo(
    () =>
      ({
        '--dw-tile-w': `${tileWidth}px`,
        '--dw-tile-h': `${tileHeight}px`,
        '--dw-gap': `${gap}px`,
        '--dw-radius': `${radius}px`,
        '--dw-perspective': `${perspective}px`,
        '--dw-lift': `${lift}px`,
        '--dw-dim': dim,
        '--dw-gray': grayscale ? 1 : 0,
        '--dw-overlay': overlayColor,
        '--dw-edge': `${Math.max(0, (1 - fade) * 100)}%`,
        ...style,
      }) as CSSProperties,
    [tileWidth, tileHeight, gap, radius, perspective, lift, dim, grayscale, overlayColor, fade, style],
  );

  const renderTile = (item: DriftWallItem, id: string, column: number) => {
    const commonProps = {
      className: `drift-wall__tile${activeId === id ? ' is-active' : ''}`,
      'data-tile-id': id,
      'data-col': column,
      onFocus: () => activate(id, column),
      onBlur: release,
      onClick: item.onClick,
    };
    const inner = (
      <span className="drift-wall__inner">
        <img src={item.image} alt="" loading="lazy" decoding="async" draggable={false} />
        <span className="drift-wall__overlay" aria-hidden="true" />
        {item.title && <span className="drift-wall__caption">{item.title}</span>}
      </span>
    );

    if (item.href) {
      return (
        <a key={id} href={item.href} target="_blank" rel="noreferrer noopener" {...commonProps}>
          {inner}
        </a>
      );
    }
    return (
      <div
        key={id}
        tabIndex={0}
        role="button"
        aria-label={item.title ? `进入题库：${item.title}` : '进入题库'}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            item.onClick?.();
          }
        }}
        {...commonProps}
      >
        {inner}
      </div>
    );
  };

  const rootClass = ['drift-wall', reduced ? 'drift-wall--reduced' : '', className].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={rootClass}
      style={cssVars}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => { wallHoveredRef.current = true; }}
      onPointerLeave={handlePointerLeave}
      role="group"
      aria-label="Drifting wall of tiles"
    >
      <div ref={planeRef} className="drift-wall__plane">
        {columnItems.map((column, columnIndex) => {
          const meta = columnMeta[columnIndex];
          if (!meta) return null;
          return (
            <div className="drift-wall__col" key={`col-${columnIndex}`}>
              <div className="drift-wall__track" ref={(element) => { trackRefs.current[columnIndex] = element; }}>
                {Array.from({ length: meta.copies }, (_, copyIndex) =>
                  column.map((item, itemIndex) => renderTile(item, `${columnIndex}-${copyIndex}-${itemIndex}`, columnIndex)),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
