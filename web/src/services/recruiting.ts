import type {
  Candidate,
  CandidateApplication,
  CandidateApplicationInput,
  CandidateInput,
  CandidateStage,
  JobPosting,
  JobPostingInput,
  JobPostingStatus,
  PipelineSummary,
} from '@/types/recruiting';
import { createApiClient } from './http';

const http = createApiClient({
  baseURL: '/api',
  timeout: 10000,
});

export async function listJobPostings(status?: JobPostingStatus): Promise<JobPosting[]> {
  const { data } = await http.get<JobPosting[]>('/hr/job-postings', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function createJobPosting(input: JobPostingInput): Promise<JobPosting> {
  const { data } = await http.post<JobPosting>('/hr/job-postings', input);
  return data;
}

export async function updateJobPosting(
  id: number,
  input: Partial<JobPostingInput>,
): Promise<JobPosting> {
  const { data } = await http.patch<JobPosting>(`/hr/job-postings/${id}`, input);
  return data;
}

export async function deleteJobPosting(id: number): Promise<void> {
  await http.delete(`/hr/job-postings/${id}`);
}

export async function listCandidates(): Promise<Candidate[]> {
  const { data } = await http.get<Candidate[]>('/hr/candidates');
  return data;
}

export async function createCandidate(input: CandidateInput): Promise<Candidate> {
  const { data } = await http.post<Candidate>('/hr/candidates', input);
  return data;
}

export async function updateCandidate(
  id: number,
  input: Partial<CandidateInput>,
): Promise<Candidate> {
  const { data } = await http.patch<Candidate>(`/hr/candidates/${id}`, input);
  return data;
}

export async function deleteCandidate(id: number): Promise<void> {
  await http.delete(`/hr/candidates/${id}`);
}

export async function listCandidateApplications(params?: {
  jobPostingId?: number;
  stage?: CandidateStage;
}): Promise<CandidateApplication[]> {
  const query: Record<string, string | number> = {};
  if (params?.jobPostingId != null) query.job_posting_id = params.jobPostingId;
  if (params?.stage) query.stage = params.stage;
  const { data } = await http.get<CandidateApplication[]>('/hr/candidate-applications', {
    params: Object.keys(query).length ? query : undefined,
  });
  return data;
}

export async function createCandidateApplication(
  input: CandidateApplicationInput,
): Promise<CandidateApplication> {
  const { data } = await http.post<CandidateApplication>('/hr/candidate-applications', input);
  return data;
}

export async function updateCandidateApplication(
  id: number,
  input: Partial<Pick<CandidateApplicationInput, 'stage' | 'rating' | 'stage_note'>>,
): Promise<CandidateApplication> {
  const { data } = await http.patch<CandidateApplication>(
    `/hr/candidate-applications/${id}`,
    input,
  );
  return data;
}

export async function deleteCandidateApplication(id: number): Promise<void> {
  await http.delete(`/hr/candidate-applications/${id}`);
}

export async function getPipelineSummary(): Promise<PipelineSummary> {
  const { data } = await http.get<PipelineSummary>('/hr/pipeline-summary');
  return data;
}
