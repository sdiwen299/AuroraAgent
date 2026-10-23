import type { ReactNode } from 'react';
import {
  ApiOutlined,
  ArrowRightOutlined,
  FileTextOutlined,
  SendOutlined,
  TrophyOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ViewMode } from '@/layout/navigation';
import type { OnboardingAction } from '@/features/onboarding/actionRouting';
import styles from '../dashboard.module.css';

interface Props {
  onNavigate: (view: ViewMode) => void;
  onOnboardingAction: (action: OnboardingAction) => void;
}

interface WorkflowStep {
  key: string;
  title: string;
  description: string;
  cta: string;
  icon: ReactNode;
  run: () => void;
}

export default function WorkflowJourney({ onNavigate, onOnboardingAction }: Props) {
  const steps: WorkflowStep[] = [
    {
      key: 'configure_ai',
      title: '配置模型 API',
      description: '接入你自己的模型服务，开启 AI 对话与工具调用。',
      cta: '去配置',
      icon: <ApiOutlined />,
      run: () => onOnboardingAction('configure_ai'),
    },
    {
      key: 'resume',
      title: '整理简历',
      description: '上传或创建主简历，沉淀可复用的经历与素材。',
      cta: '整理简历',
      icon: <FileTextOutlined />,
      run: () => onOnboardingAction('create_primary_resume'),
    },
    {
      key: 'application',
      title: '投递岗位',
      description: '记录目标岗位与投递进度，建立持续跟进的节奏。',
      cta: '添加投递',
      icon: <SendOutlined />,
      run: () => onOnboardingAction('create_first_application'),
    },
    {
      key: 'interview',
      title: '应试准备',
      description: '按岗位刷题、模拟面试，每轮拿到结构化复盘。',
      cta: '进入面试',
      icon: <VideoCameraOutlined />,
      run: () => onNavigate('interview'),
    },
    {
      key: 'offer',
      title: 'Offer 决策',
      description: '对比薪资与条件，沉淀谈薪策略，从容做选择。',
      cta: '查看 Offer',
      icon: <TrophyOutlined />,
      run: () => onNavigate('offers'),
    },
  ];

  return (
    <section className={styles.workflowSection} aria-labelledby="dashboard-workflow-title">
      <div className={styles.workflowHeader}>
        <div className={styles.workflowHeaderText}>
          <span className={styles.workflowEyebrow}>求职工作流</span>
          <h2 id="dashboard-workflow-title" className={styles.sectionHeading}>
            从配置到 Offer，五步走完整个流程
          </h2>
          <p className={styles.workflowSubtitle}>
            按顺序推进每一步，曙光会在后台生成跟进提醒、面试准备与 Offer 截止期行动。
          </p>
        </div>
        <span className={styles.workflowHint}>点击任意一步直接进入</span>
      </div>
      <ol className={styles.workflowSteps}>
        {steps.map((step, index) => (
          <li key={step.key} className={styles.workflowStepItem}>
            <button
              type="button"
              className={styles.workflowStep}
              data-workflow-step={step.key}
              onClick={step.run}
            >
              <span className={styles.workflowStepTop}>
                <span className={styles.workflowStepIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.workflowStepIcon} aria-hidden="true">
                  {step.icon}
                </span>
              </span>
              <strong className={styles.workflowStepTitle}>{step.title}</strong>
              <span className={styles.workflowStepDesc}>{step.description}</span>
              <span className={styles.workflowStepCta}>
                {step.cta}
                <ArrowRightOutlined />
              </span>
            </button>
            {index < steps.length - 1 ? <span className={styles.workflowConnector} aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
