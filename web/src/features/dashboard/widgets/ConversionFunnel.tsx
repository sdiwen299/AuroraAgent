import type { FunnelStage } from '@/lib/insights';
import styles from '../dashboard.module.css';

const COLORS = ['#6366f1', '#7c6ff2', '#a855f7', '#059669'];

interface Props {
  stages: FunnelStage[];
  /** 卡片标题；不传时保持候选人仪表盘的「转化漏斗」。 */
  title?: string;
  /** 每段颜色，按 stages 顺序取用；不传时保持原有配色。 */
  colors?: string[];
}

export default function ConversionFunnel({ stages, title = '转化漏斗', colors = COLORS }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{title}</div>
      {stages.map((s, i) => {
        const color = colors[i] ?? COLORS[i % COLORS.length];
        return (
          <div key={s.key} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{s.label}</span>
            <div className={styles.funnelBarWrap}>
              <div
                className={styles.funnelBar}
                style={{ width: `${Math.max(s.ratio * 100, 3)}%`, background: color }}
              />
            </div>
            <span className={`${styles.funnelCount} op-tnum`} style={{ color }}>
              {s.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
