export type JobPostingStatus = 'draft' | 'open' | 'paused' | 'closed';

export type CandidateStage =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected';

export interface JobPosting {
  id: number;
  title: string;
  company_name: string;
  department: string;
  location: string;
  employment_type: string;
  salary_range: string;
  headcount: number;
  description: string;
  requirements: string;
  status: JobPostingStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface JobPostingInput {
  title: string;
  company_name?: string;
  department?: string;
  location?: string;
  employment_type?: string;
  salary_range?: string;
  headcount?: number;
  description?: string;
  requirements?: string;
  status?: JobPostingStatus;
  notes?: string;
}

export interface Candidate {
  id: number;
  name: string;
  email: string;
  phone: string;
  source: string;
  headline: string;
  resume_id: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CandidateInput {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  headline?: string;
  resume_id?: number | null;
  notes?: string;
}

export interface CandidateApplication {
  id: number;
  job_posting_id: number;
  candidate_id: number;
  stage: CandidateStage;
  rating: number | null;
  stage_note: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateApplicationInput {
  job_posting_id: number;
  candidate_id: number;
  stage?: CandidateStage;
  rating?: number | null;
  stage_note?: string;
}

export type PipelineSummary = Record<CandidateStage, number>;

export const JOB_POSTING_STATUSES: JobPostingStatus[] = ['draft', 'open', 'paused', 'closed'];

export const JOB_POSTING_STATUS_LABELS: Record<JobPostingStatus, string> = {
  draft: '草稿',
  open: '招聘中',
  paused: '已暂停',
  closed: '已关闭',
};

export const CANDIDATE_STAGES: CandidateStage[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
];

export const CANDIDATE_STAGE_LABELS: Record<CandidateStage, string> = {
  applied: '待筛选',
  screening: '筛选中',
  interview: '面试中',
  offer: '已发 Offer',
  hired: '已录用',
  rejected: '已终止',
};

export const CANDIDATE_STAGE_COLORS: Record<CandidateStage, string> = {
  applied: 'default',
  screening: 'processing',
  interview: 'blue',
  offer: 'gold',
  hired: 'green',
  rejected: 'red',
};
