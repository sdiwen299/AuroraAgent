import type { UserRole } from '@/components/AuthGate/model';

export type ViewMode =
  | 'dashboard'
  | 'board'
  | 'applications-list'
  | 'calendar'
  | 'reminders'
  | 'interview'
  | 'reviews'
  | 'offers'
  | 'knowledge'
  | 'questions'
  | 'resumes'
  | 'pilot'
  | 'settings';

export type ModuleKey =
  | 'today'
  | 'applications'
  | 'written_test'
  | 'interview'
  | 'offers'
  | 'resources'
  | 'pilot'
  | 'settings';

export type NavigationGroupKey = 'primary' | 'resources' | 'utility';

export interface NavigationGroup {
  key: NavigationGroupKey;
  label: string;
}

export interface ModuleNavItem {
  key: ModuleKey;
  label: string;
  defaultView: ViewMode;
  group: NavigationGroupKey;
}

export interface ModuleTabItem {
  view: ViewMode;
  label: string;
}

export function moduleNavForRole(role: UserRole = 'candidate'): ModuleNavItem[] {
  if (role !== 'hr') return MODULE_NAV;
  return [
    { key: 'settings', label: '配置 API', defaultView: 'settings', group: 'primary' },
    { key: 'applications', label: '岗位投递', defaultView: 'board', group: 'primary' },
    { key: 'resources', label: '筛选简历', defaultView: 'resumes', group: 'primary' },
    { key: 'written_test', label: '笔试', defaultView: 'questions', group: 'primary' },
    { key: 'interview', label: '面试', defaultView: 'interview', group: 'primary' },
    { key: 'offers', label: '录用进展', defaultView: 'offers', group: 'primary' },
  ];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  { key: 'primary', label: '主要任务' },
  { key: 'resources', label: '常用资料' },
  { key: 'utility', label: '辅助' },
];

export const MODULE_NAV: ModuleNavItem[] = [
  { key: 'today', label: '今日', defaultView: 'dashboard', group: 'primary' },
  { key: 'applications', label: '投递', defaultView: 'board', group: 'primary' },
  { key: 'written_test', label: '笔试', defaultView: 'questions', group: 'primary' },
  { key: 'interview', label: '面试', defaultView: 'interview', group: 'primary' },
  { key: 'offers', label: 'Offer', defaultView: 'offers', group: 'primary' },
  { key: 'resources', label: '素材库', defaultView: 'resumes', group: 'resources' },
  { key: 'settings', label: '设置', defaultView: 'settings', group: 'utility' },
];

export const MODULE_TABS: Record<ModuleKey, ModuleTabItem[]> = {
  today: [
    { view: 'dashboard', label: '概览' },
    { view: 'reminders', label: '提醒' },
    { view: 'calendar', label: '日历' },
  ],
  applications: [
    { view: 'board', label: '看板' },
    { view: 'applications-list', label: '列表' },
  ],
  written_test: [
    { view: 'questions', label: '笔试' },
  ],
  interview: [
    { view: 'interview', label: '面试' },
  ],
  offers: [
    { view: 'offers', label: 'Offer' },
  ],
  resources: [
    { view: 'resumes', label: '简历' },
    { view: 'reviews', label: '经历素材' },
    { view: 'knowledge', label: '参考资料' },
  ],
  pilot: [{ view: 'pilot', label: '会话中心' }],
  settings: [{ view: 'settings', label: '设置' }],
};

const VIEW_TO_MODULE: Partial<Record<ViewMode, ModuleKey>> = {
  dashboard: 'today',
  reminders: 'today',
  resumes: 'resources',
  reviews: 'resources',
  knowledge: 'resources',
  questions: 'written_test',
  board: 'applications',
  'applications-list': 'applications',
  calendar: 'today',
  offers: 'offers',
  interview: 'interview',
  pilot: 'pilot',
  settings: 'settings',
};

const DEFAULT_VIEW_BY_MODULE: Record<ModuleKey, ViewMode> = {
  today: 'dashboard',
  applications: 'board',
  written_test: 'questions',
  interview: 'interview',
  offers: 'offers',
  resources: 'resumes',
  pilot: 'pilot',
  settings: 'settings',
};

export function resolveModuleForView(view: ViewMode): ModuleKey {
  const module = VIEW_TO_MODULE[view];
  if (!module) throw new Error(`View ${view} is not part of v0.1 navigation`);
  return module;
}

export function defaultViewForModule(module: ModuleKey): ViewMode {
  return DEFAULT_VIEW_BY_MODULE[module];
}

export function moduleTabsForView(view: ViewMode, role: UserRole = 'candidate'): ModuleTabItem[] {
  const tabs = MODULE_TABS[resolveModuleForView(view)];
  if (role !== 'hr') return tabs;
  if (view === 'board' || view === 'applications-list') return [{ view: 'board', label: '岗位看板' }, { view: 'applications-list', label: '岗位列表' }];
  if (view === 'resumes') return [{ view: 'resumes', label: '候选人' }];
  if (view === 'offers') return [{ view: 'offers', label: '录用进展' }];
  return tabs;
}
