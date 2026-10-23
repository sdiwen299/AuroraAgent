import type { CSSProperties } from 'react';

import styles from './SakuraRain.module.css';

interface Petal {
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
  sway: number;
  rotate: number;
  opacity: number;
  color: string;
}

const petals: Petal[] = [
  { left: 4, delay: -3, duration: 18, size: 11, drift: 32, sway: -18, rotate: 28, opacity: 0.42, color: '#f3b2c4' },
  { left: 11, delay: -11, duration: 22, size: 8, drift: -24, sway: 22, rotate: -18, opacity: 0.3, color: '#f8c8d4' },
  { left: 17, delay: -7, duration: 20, size: 13, drift: 42, sway: -28, rotate: 34, opacity: 0.36, color: '#ef9fb6' },
  { left: 23, delay: -16, duration: 24, size: 7, drift: -18, sway: 16, rotate: -42, opacity: 0.28, color: '#f7c0ce' },
  { left: 29, delay: -1, duration: 19, size: 10, drift: 26, sway: 24, rotate: 24, opacity: 0.34, color: '#f4aec1' },
  { left: 35, delay: -13, duration: 23, size: 8, drift: -34, sway: -20, rotate: -30, opacity: 0.27, color: '#f8cbd6' },
  { left: 41, delay: -5, duration: 21, size: 12, drift: 20, sway: 30, rotate: 44, opacity: 0.38, color: '#eea0b7' },
  { left: 47, delay: -19, duration: 25, size: 7, drift: -28, sway: -16, rotate: -24, opacity: 0.3, color: '#f8c6d3' },
  { left: 53, delay: -9, duration: 18, size: 10, drift: 38, sway: 18, rotate: 32, opacity: 0.35, color: '#f2aec1' },
  { left: 59, delay: -15, duration: 22, size: 8, drift: -22, sway: -26, rotate: -38, opacity: 0.28, color: '#f9ccd7' },
  { left: 65, delay: -4, duration: 20, size: 12, drift: 30, sway: 20, rotate: 26, opacity: 0.37, color: '#eea1b7' },
  { left: 71, delay: -21, duration: 24, size: 7, drift: -26, sway: -22, rotate: -26, opacity: 0.26, color: '#f8c2d1' },
  { left: 77, delay: -8, duration: 19, size: 11, drift: 24, sway: 28, rotate: 36, opacity: 0.34, color: '#f2adbf' },
  { left: 82, delay: -17, duration: 23, size: 8, drift: -36, sway: -18, rotate: -34, opacity: 0.29, color: '#f9cbd7' },
  { left: 87, delay: -2, duration: 21, size: 13, drift: 34, sway: 24, rotate: 42, opacity: 0.38, color: '#ee9eb5' },
  { left: 91, delay: -12, duration: 25, size: 7, drift: -20, sway: -26, rotate: -22, opacity: 0.27, color: '#f7c2d0' },
  { left: 95, delay: -6, duration: 20, size: 10, drift: 28, sway: 18, rotate: 30, opacity: 0.33, color: '#f3afc1' },
  { left: 99, delay: -20, duration: 22, size: 8, drift: -30, sway: -20, rotate: -40, opacity: 0.28, color: '#f8c8d4' },
];

const petalStyle = (petal: Petal): CSSProperties =>
  ({
    '--sakura-left': `${petal.left}%`,
    '--sakura-delay': `${petal.delay}s`,
    '--sakura-duration': `${petal.duration}s`,
    '--sakura-size': `${petal.size}px`,
    '--sakura-drift': `${petal.drift}px`,
    '--sakura-sway': `${petal.sway}px`,
    '--sakura-rotate': `${petal.rotate}deg`,
    '--sakura-opacity': petal.opacity,
    '--sakura-color': petal.color,
  }) as CSSProperties;

export default function SakuraRain() {
  return (
    <div className={styles.layer} aria-hidden="true">
      {petals.map((petal, index) => (
        <span key={index} className={styles.petal} style={petalStyle(petal)} />
      ))}
    </div>
  );
}
