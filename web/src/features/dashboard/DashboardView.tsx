import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Collapse, Empty } from 'antd';
import dayjs from 'dayjs';
import { getApplicationMaterialKit } from '@/services/materialKits';
import {
  summarizePipelineHealth,
  type ActionCommand,
  type PipelineInsight,
} from '@/lib/pipelineInsights';
import { deriveActionHints } from '@/lib/actionHints';
import { deriveMissionControl } from '@/lib/missionControl';
import { computeKpis, computeFunnel, computeMomentum } from '@/lib/insights';
import type { ViewMode } from '@/layout/navigation';
import type { MaterialKitViewModel } from '@/types/materialKit';
import type { MissionMetricKind } from '@/lib/missionControl';
import ActionDetailDrawer from '@/features/pipeline/ActionDetailDrawer';
import KpiCards from './widgets/KpiCards';
import ConversionFunnel from './widgets/ConversionFunnel';
import MomentumChart from './widgets/MomentumChart';
import UpcomingSchedule from './widgets/UpcomingSchedule';
import WeeklyMissionPanel, { deriveWeeklySummary } from './widgets/WeeklyMissionPanel';
import TodayBoardsGallery from './widgets/TodayBoardsGallery';
import styles from './dashboard.module.css';
import OnboardingChecklist from '@/features/onboarding/OnboardingChecklist';
import type { OnboardingAction } from '@/features/onboarding/actionRouting';
import {
  getOnboarding,
  ONBOARDING_QUERY_KEY,
  setOnboardingForceOpen,
} from '@/services/onboarding';
import { deriveTodayWorkspace, deriveWeeklyCompletedHighlight } from './todayWorkspace';
import type { Application } from '@/types/application';
import type { ScheduleEvent } from '@/types/event';
import type { Offer } from '@/types/offer';
import type { PracticeStats } from '@/types/question';

type DetailAction = ActionCommand & { id?: string };
type DetailInsight = PipelineInsight & {
  primaryAction: DetailAction;
  secondaryActions?: DetailAction[];
};

function getActionId(insight: PipelineInsight, action: DetailAction, kind: 'primary' | 'secondary') {
  return action.id ?? `${insight.id}:${kind}:${action.label}`;
}

function findInsightAction(item: PipelineInsight, actionId: string): DetailAction {
  const detail = item as DetailInsight;
  const actions = [detail.primaryAction, ...(detail.secondaryActions ?? [])];
  return (
    actions.find((action, index) => getActionId(item, action, index === 0 ? 'primary' : 'secondary') === actionId) ??
    detail.primaryAction
  );
}

interface Props {
  applications: Application[];
  events: ScheduleEvent[];
  offers: Offer[];
  practiceStats?: PracticeStats;
  dataState?: {
    eventsLoading?: boolean;
    eventsError?: boolean;
    offersLoading?: boolean;
    offersError?: boolean;
    practiceLoading?: boolean;
    practiceError?: boolean;
  };
  onNavigate: (v: ViewMode) => void;
  onOpenDetailById: (id: number) => void;
  onAddApplication: () => void;
  onOnboardingAction: (action: OnboardingAction) => void;
}

export default function DashboardView({
  applications: apps,
  events,
  offers,
  practiceStats,
  dataState,
  onNavigate,
  onOpenDetailById,
  onAddApplication,
  onOnboardingAction,
}: Props) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => dayjs());
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const onboardingQ = useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: getOnboarding,
    retry: false,
  });
  const collapseOnboarding = useMutation({
    mutationFn: () => setOnboardingForceOpen(false),
    onSuccess: (status) => queryClient.setQueryData(ONBOARDING_QUERY_KEY, status),
  });
  const activeApplications = useMemo(
    () => apps.filter((app) => ['pending', 'applied', 'written_test', 'interview', 'offer'].includes(app.status)),
    [apps],
  );
  const activeApplicationIds = useMemo(() => activeApplications.slice(0, 8).map((app) => app.id), [activeApplications]);

  const materialKitsQ = useQuery({
    queryKey: ['mission-control', 'material-kits', activeApplicationIds],
    queryFn: async () => {
      const kits = await Promise.all(activeApplicationIds.map((id) => getApplicationMaterialKit(id)));
      return kits.filter((kit): kit is MaterialKitViewModel => Boolean(kit));
    },
    enabled: activeApplicationIds.length > 0,
    retry: false,
  });
  const hasPartialMaterialKitCoverage = activeApplications.length > activeApplicationIds.length;
  const missionMaterialKits = hasPartialMaterialKitCoverage ? undefined : materialKitsQ.data;

  const kpis = useMemo(() => computeKpis(apps, now), [apps, now]);
  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const momentum = useMemo(() => computeMomentum(apps, 4, now), [apps, now]);
  const insights = useMemo(
    () => deriveActionHints({ apps, events, offers, practiceStats, weeklyTarget: 6, now }),
    [apps, events, offers, practiceStats, now],
  );
  const health = useMemo(() => summarizePipelineHealth(apps, insights, 6, now), [apps, insights, now]);
  const mission = useMemo(
    () =>
      deriveMissionControl({
        apps,
        events,
        offers,
        materialKits: missionMaterialKits,
        practiceStats,
        insights,
        healthLabel: health.label,
        weeklyTarget: 6,
        now,
      }),
    [apps, events, offers, missionMaterialKits, practiceStats, insights, health.label, now],
  );
  const missionUnavailableKinds = useMemo(() => {
    const kinds: MissionMetricKind[] = [];
    if (dataState?.eventsLoading || dataState?.eventsError) kinds.push('interviews');
    if (dataState?.offersLoading || dataState?.offersError) kinds.push('offers');
    if (dataState?.practiceLoading || dataState?.practiceError) kinds.push('practice');
    if (hasPartialMaterialKitCoverage || materialKitsQ.isLoading || materialKitsQ.isError) kinds.push('materials');
    return kinds;
  }, [
    dataState?.eventsError,
    dataState?.eventsLoading,
    hasPartialMaterialKitCoverage,
    materialKitsQ.isError,
    materialKitsQ.isLoading,
    dataState?.offersError,
    dataState?.offersLoading,
    dataState?.practiceError,
    dataState?.practiceLoading,
  ]);

  const todayWorkspace = useMemo(
    () => deriveTodayWorkspace({ actions: mission.actions, events, now }),
    [events, mission.actions, now],
  );
  const completedHighlight = useMemo(
    () => deriveWeeklyCompletedHighlight({ applications: apps, offers, now }),
    [apps, offers, now],
  );
  const selectedInsight = useMemo(
    () => insights.find((item) => item.id === selectedInsightId) ?? null,
    [insights, selectedInsightId],
  );

  useEffect(() => {
    if (selectedInsightId && !selectedInsight) {
      setSelectedInsightId(null);
    }
  }, [selectedInsight, selectedInsightId]);

  const handleAction = (item: PipelineInsight) => {
    setSelectedInsightId(item.id);
  };

  const runInsightAction = (item: PipelineInsight, actionId: string) => {
    const action = findInsightAction(item, actionId);
    const appId = action.appId ?? item.appId;

    setSelectedInsightId(null);
    if (action.target === 'board' && appId) {
      onOpenDetailById(appId);
      return;
    }
    onNavigate(action.target);
  };

  const onboarding = onboardingQ.isError ? (
    <Alert
      type="warning"
      showIcon
      message="新手引导暂时加载失败"
      action={<Button onClick={() => onboardingQ.refetch()}>重试</Button>}
      style={{ marginBottom: 16 }}
    />
  ) : onboardingQ.data && (!onboardingQ.data.is_complete || onboardingQ.data.force_open) ? (
    <div style={{ marginBottom: 16 }}>
      <OnboardingChecklist
        status={onboardingQ.data}
        onCollapse={() => collapseOnboarding.mutate()}
        onAction={onOnboardingAction}
      />
    </div>
  ) : null;

  if (apps.length === 0) {
    return (
      <div className={styles.grid}>
        {onboarding}
        <div className={styles.card} style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ color: 'var(--op-ink)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            从第一条投递开始建立求职节奏
          </div>
          <div style={{ color: 'var(--op-muted)', marginBottom: 16 }}>
            添加投递后，OfferPilot 会自动生成跟进提醒、面试准备和 Offer 截止期行动。
          </div>
          <Button onClick={onAddApplication}>
            添加第一个投递
          </Button>
        </div>
      </div>
    );
  }

  if (selectedInsight) {
    return (
      <ActionDetailDrawer
        insight={selectedInsight}
        open={!!selectedInsight}
        onClose={() => setSelectedInsightId(null)}
        onRunAction={runInsightAction}
      />
    );
  }

  return (
    <div className={styles.grid}>
      {onboarding}
      <TodayBoardsGallery
        boards={[
          {
            id: 'primary-action',
            eyebrow: '当前最重要的行动',
            title: todayWorkspace.primaryAction?.title ?? completedHighlight?.title ?? '今天没有需要立即处理的行动',
            description: todayWorkspace.primaryAction?.reason ?? completedHighlight?.detail ?? '保持当前节奏，随时查看新的行动。',
            image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=85',
            content: todayWorkspace.primaryAction ? (
              <div className={styles.todayBoardActionContent}>
                <p>{todayWorkspace.primaryAction.reason}</p>
                <Button size="large" onClick={() => handleAction(todayWorkspace.primaryAction!)}>
                  {todayWorkspace.primaryAction.primaryAction.label}
                </Button>
              </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天没有需要立即处理的行动。" />,
          },
          {
            id: 'other-actions',
            eyebrow: '今日其他待办',
            title: todayWorkspace.otherActions.length ? `${todayWorkspace.otherActions.length} 项待办` : '暂无其他待办',
            description: todayWorkspace.otherActions.length ? '还有事项需要完成。' : '今天的其他事项已经清空。',
            image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=85',
            content: todayWorkspace.otherActions.length ? (
              <div className={styles.todaySecondaryList}>
                {todayWorkspace.otherActions.map((item) => (
                  <button key={item.id} type="button" className={styles.todaySecondaryRow} onClick={() => handleAction(item)}>
                    <span><strong>{item.title}</strong><small>{item.reason}</small></span>
                    <span>{item.primaryAction.label}</span>
                  </button>
                ))}
              </div>
            ) : <div className={styles.empty}>暂无其他待办</div>,
          },
          {
            id: 'schedule',
            eyebrow: '未来 7 天日程',
            title: todayWorkspace.upcomingEvents.length ? `${todayWorkspace.upcomingEvents.length} 项安排` : '暂无安排',
            description: '查看近期面试、笔试和跟进安排。',
            image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85',
            content: <UpcomingSchedule events={todayWorkspace.upcomingEvents} onOpenCalendar={() => onNavigate('calendar')} />,
          },
          {
            id: 'weekly-progress',
            eyebrow: '本周进度',
            title: deriveWeeklySummary(mission.metrics, missionUnavailableKinds),
            description: '根据当前任务状态汇总。',
            image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=85',
            content: <WeeklyMissionPanel metrics={mission.metrics} unavailableKinds={missionUnavailableKinds} onNavigate={onNavigate} />,
          },
        ]}
      />

      <Collapse
        className={styles.analyticsCollapse}
        defaultActiveKey={[]}
        items={[{
          key: 'analytics',
          label: '数据分析',
          children: (
            <div className={styles.analyticsBody}>
              <KpiCards kpis={kpis} />
              <div className={styles.row2b}>
                <ConversionFunnel stages={funnel} />
                <MomentumChart buckets={momentum} />
              </div>
            </div>
          ),
        }]}
      />
    </div>
  );
}
