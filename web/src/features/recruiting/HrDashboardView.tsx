import { useQuery } from '@tanstack/react-query';
import { Button, Spin } from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  CANDIDATE_STAGE_LABELS,
  JOB_POSTING_STATUS_LABELS,
  type CandidateStage,
  type JobPosting,
} from '@/types/recruiting';
import { getPipelineSummary, listCandidates, listJobPostings } from '@/services/recruiting';
import type { ViewMode } from '@/layout/navigation';
import type { FunnelStage } from '@/lib/insights';
import ConversionFunnel from '@/features/dashboard/widgets/ConversionFunnel';
import styles from './hr.module.css';

// 漏斗只展示正向推进阶段；各段颜色取纸感设计令牌，与全局状态色一致。
const FUNNEL_STAGES: CandidateStage[] = ['applied', 'screening', 'interview', 'offer', 'hired'];

const FUNNEL_COLORS: string[] = [
  'var(--op-muted)',
  'var(--op-info)',
  'var(--op-action)',
  'var(--op-warning)',
  'var(--op-success)',
];

interface Props {
  onNavigate?: (view: ViewMode) => void;
}

export default function HrDashboardView({ onNavigate }: Props) {
  const postings = useQuery({ queryKey: ['hr', 'job-postings'], queryFn: () => listJobPostings() });
  const candidates = useQuery({ queryKey: ['hr', 'candidates'], queryFn: listCandidates });
  const summary = useQuery({ queryKey: ['hr', 'pipeline-summary'], queryFn: getPipelineSummary });

  const allPostings = postings.data ?? [];
  const openPostings = allPostings.filter((posting: JobPosting) => posting.status === 'open');
  const appliedTotal = summary.data?.applied ?? 0;

  const stats = [
    {
      label: '招聘中岗位',
      value: openPostings.length,
      hint: '状态为招聘中',
      icon: <AuditOutlined />,
      loading: postings.isLoading,
    },
    {
      label: '岗位总数',
      value: allPostings.length,
      hint: '含草稿与已关闭',
      icon: <UnorderedListOutlined />,
      loading: postings.isLoading,
    },
    {
      label: '候选人',
      value: candidates.data?.length ?? 0,
      hint: '人才库累计',
      icon: <TeamOutlined />,
      loading: candidates.isLoading,
    },
    {
      label: '已录用',
      value: summary.data?.hired ?? 0,
      hint: '流水线转化完成',
      icon: <CheckCircleOutlined />,
      loading: summary.isLoading,
    },
  ];

  const funnelStages: FunnelStage[] = summary.data
    ? FUNNEL_STAGES.map((stage) => ({
        key: stage,
        label: CANDIDATE_STAGE_LABELS[stage],
        count: summary.data?.[stage] ?? 0,
        ratio: appliedTotal > 0 ? (summary.data?.[stage] ?? 0) / appliedTotal : 0,
      }))
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>HR 工作台</span>
          <h1 className={styles.title}>招聘概览</h1>
          <p className={styles.subtitle}>
            跟进在招岗位、候选人流水线和录用转化，从这里进入岗位与候选人管理。
          </p>
        </div>
        {onNavigate ? (
          <div className={styles.headerActions}>
            <Button onClick={() => onNavigate('offers')}>候选人筛选</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => onNavigate('board')}>
              发布岗位
            </Button>
          </div>
        ) : null}
      </header>

      <section className={styles.statRow} aria-label="招聘关键指标">
        {stats.map((item) => (
          <div key={item.label} className={styles.statCard}>
            <div className={styles.statLabel}>
              {item.icon}
              {item.label}
            </div>
            <div className={`${styles.statValue} op-tnum`}>
              {item.loading ? '—' : item.value}
            </div>
            <div className={styles.statHint}>{item.hint}</div>
          </div>
        ))}
      </section>

      <div className={styles.grid2}>
        {summary.isLoading ? (
          <section className={styles.panel} aria-label="招聘漏斗">
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleText}>招聘漏斗</span>
            </div>
            <div className={styles.spinWrap}>
              <Spin />
            </div>
          </section>
        ) : summary.isError ? (
          <section className={styles.panel} aria-label="招聘漏斗">
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleText}>招聘漏斗</span>
            </div>
            <div className="op-empty-state">
              <div className={styles.emptyBox}>
                <strong>流水线数据加载失败</strong>
                <span>请检查本地服务是否在运行，然后重试。</span>
                <Button onClick={() => void summary.refetch()}>重试</Button>
              </div>
            </div>
          </section>
        ) : (
          <ConversionFunnel title="招聘漏斗" stages={funnelStages} colors={FUNNEL_COLORS} />
        )}

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span className={styles.panelTitleText}>招聘中的岗位</span>
            <span className={styles.panelMeta}>
              {postings.isLoading ? '加载中' : `${openPostings.length} 个在招`}
              {onNavigate ? (
                <Button type="link" size="small" onClick={() => onNavigate('board')}>
                  管理岗位
                </Button>
              ) : null}
            </span>
          </div>
          {postings.isLoading ? (
            <div className={styles.spinWrap}>
              <Spin />
            </div>
          ) : postings.isError ? (
            <div className="op-empty-state">
              <div className={styles.emptyBox}>
                <strong>岗位数据加载失败</strong>
                <span>请检查本地服务是否在运行，然后重试。</span>
                <Button onClick={() => void postings.refetch()}>重试</Button>
              </div>
            </div>
          ) : openPostings.length > 0 ? (
            <div>
              {openPostings.map((posting: JobPosting) => (
                <div key={posting.id} className="op-list-row">
                  <div className={styles.rowMain}>
                    <div>
                      <div className={styles.rowTitle}>{posting.title}</div>
                      <div className={styles.rowMeta}>
                        {[posting.company_name, posting.location, posting.salary_range]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </div>
                    <span className="op-pill op-pill--green">
                      <span className="op-pill-dot" />
                      {JOB_POSTING_STATUS_LABELS[posting.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="op-empty-state">
              <div className={styles.emptyBox}>
                <strong>还没有招聘中的岗位</strong>
                <span>发布岗位后，候选人就可以开始投递。</span>
                {onNavigate ? (
                  <Button type="primary" onClick={() => onNavigate('board')}>
                    发布岗位
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
