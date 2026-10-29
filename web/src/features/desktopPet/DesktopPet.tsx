import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react';
import styles from './DesktopPet.module.css';

const FRAME_MODULES = import.meta.glob('./assets/pet/**/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const HR_PET_IMAGE = new URL('./assets/hr-pet.png', import.meta.url).href;

const PET_STATES = ['standby', 'sleep', 'eat', 'discomfort', 'left', 'right', 'love'] as const;
type PetState = (typeof PET_STATES)[number];

const MENTION_DIR = 'mention';
const ICON_DIR = 'icon';
const FRAME_INTERVAL_MS = 250;
const PET_SIZE = 154;
const EDGE_GAP = 24;
const POSITION_STORAGE_KEY = 'aurora.desktopPet.position';

interface PetPosition {
  x: number;
  y: number;
}

function frameNumber(path: string): number {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/i, '');
  const value = Number.parseInt(name, 10);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function folderFrames(folder: string): string[] {
  const prefix = `./assets/pet/${folder}/`;
  return Object.keys(FRAME_MODULES)
    .filter((path) => path.startsWith(prefix))
    .sort((a, b) => frameNumber(a) - frameNumber(b))
    .map((path) => FRAME_MODULES[path]);
}

const PET_FRAMES: Record<string, string[]> = Object.fromEntries(
  [...PET_STATES, MENTION_DIR, ICON_DIR].map((folder) => [folder, folderFrames(folder)]),
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStoredPosition(): PetPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PetPosition>;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    return null;
  }
  return null;
}

function defaultPosition(): PetPosition {
  return {
    x: window.innerWidth - PET_SIZE - EDGE_GAP,
    y: window.innerHeight - PET_SIZE - EDGE_GAP,
  };
}

function clampPosition(position: PetPosition): PetPosition {
  return {
    x: clamp(position.x, 0, Math.max(0, window.innerWidth - PET_SIZE)),
    y: clamp(position.y, 0, Math.max(0, window.innerHeight - PET_SIZE)),
  };
}

interface DesktopPetProps {
  isHr?: boolean;
}

export default function DesktopPet({ isHr = false }: DesktopPetProps) {
  const [state, setState] = useState<PetState>('standby');
  const [frameIndex, setFrameIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(true);
  const [clickPulse, setClickPulse] = useState(0);
  const [position, setPosition] = useState<PetPosition>(() => clampPosition(readStoredPosition() ?? defaultPosition()));
  const dragOffsetRef = useRef<PetPosition | null>(null);
  const dragStartRef = useRef<PetPosition | null>(null);
  const movedRef = useRef(false);
  const greetingTimerRef = useRef<number>();

  const showGreeting = useCallback(() => {
    setGreetingVisible(true);
    setClickPulse((pulse) => pulse + 1);
    window.clearTimeout(greetingTimerRef.current);
    greetingTimerRef.current = window.setTimeout(() => {
      setGreetingVisible(false);
      setClickPulse(0);
    }, 3600);
  }, []);

  useEffect(() => {
    greetingTimerRef.current = window.setTimeout(() => setGreetingVisible(false), 5000);
    return () => window.clearTimeout(greetingTimerRef.current);
  }, []);

  const activeFolder = dragging && PET_FRAMES[MENTION_DIR].length > 0 ? MENTION_DIR : state;
  const activeFrames = useMemo(() => {
    if (hovering && state === 'standby' && !dragging && PET_FRAMES[ICON_DIR].length > 0) return PET_FRAMES[ICON_DIR];
    return PET_FRAMES[activeFolder] ?? [];
  }, [activeFolder, hovering, dragging, state]);

  useEffect(() => {
    setFrameIndex(0);
  }, [activeFolder, hovering]);

  useEffect(() => {
    if (activeFrames.length <= 1) return;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % activeFrames.length);
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeFrames]);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      /* ignore storage failures */
    }
  }, [position]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffsetRef.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = false;
    setDragging(true);
  }, [position]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    const next = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    const start = dragStartRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) movedRef.current = true;
    setPosition(clampPosition(next));
  }, []);

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current) return;
    dragOffsetRef.current = null;
    dragStartRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setState((current) => {
      const index = PET_STATES.indexOf(current);
      return PET_STATES[(index + 1) % PET_STATES.length];
    });
  }, []);

  const handleClick = useCallback(() => {
    if (movedRef.current) return;
    showGreeting();
  }, [showGreeting]);

  const frameSrc = isHr ? HR_PET_IMAGE : activeFrames[frameIndex % Math.max(activeFrames.length, 1)];

  return (
    <div
      className={styles.root}
      style={{ left: position.x, top: position.y, width: PET_SIZE, height: PET_SIZE }}
      data-desktop-pet
      data-desktop-pet-state={dragging ? MENTION_DIR : state}
      data-desktop-pet-clicked={clickPulse ? 'true' : undefined}
      aria-label="Aurora 桌宠"
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showGreeting();
        }
      }}
      onContextMenu={handleContextMenu}
      title="点击 Aurora，右键切换形象，按住拖拽移动"
    >
      {greetingVisible ? <span className={`${styles.greeting} ${styles.greetingVisible}`} role="status" aria-live="polite">
        {isHr ? '官人辛苦了，招些打工人吧' : '欢迎回来，我是你的陪伴Aurora'}
      </span> : null}
      <span key={clickPulse} className={`${styles.clickBurst} ${clickPulse ? styles.clickBurstVisible : ''}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {frameSrc ? (
        <img key={`${frameSrc}:${clickPulse}`} className={styles.image} src={frameSrc} alt="" draggable={false} />
      ) : (
        <div className={styles.placeholder}>
          <span className={styles.placeholderTitle}>Aurora</span>
          <span className={styles.placeholderHint}>我在这里陪着你</span>
        </div>
      )}
    </div>
  );
}
