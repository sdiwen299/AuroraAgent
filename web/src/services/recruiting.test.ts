import { afterEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./http', () => ({
  createApiClient: () => http,
}));

import {
  createCandidateApplication,
  createJobPosting,
  getPipelineSummary,
  listCandidateApplications,
  listJobPostings,
  updateCandidateApplication,
} from './recruiting';

afterEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  http.patch.mockReset();
  http.delete.mockReset();
});

describe('recruiting service request shapes', () => {
  it('lists job postings with an optional status filter', async () => {
    http.get.mockResolvedValue({ data: [] });

    await listJobPostings();
    expect(http.get).toHaveBeenCalledWith('/hr/job-postings', { params: undefined });

    await listJobPostings('open');
    expect(http.get).toHaveBeenCalledWith('/hr/job-postings', { params: { status: 'open' } });
  });

  it('creates a job posting under the HR namespace', async () => {
    http.post.mockResolvedValue({ data: { id: 1, title: '后端工程师' } });

    const created = await createJobPosting({ title: '后端工程师', status: 'open' });

    expect(http.post).toHaveBeenCalledWith('/hr/job-postings', {
      title: '后端工程师',
      status: 'open',
    });
    expect(created.id).toBe(1);
  });

  it('maps candidate application filters to query params', async () => {
    http.get.mockResolvedValue({ data: [] });

    await listCandidateApplications({ jobPostingId: 7, stage: 'interview' });

    expect(http.get).toHaveBeenCalledWith('/hr/candidate-applications', {
      params: { job_posting_id: 7, stage: 'interview' },
    });
  });

  it('creates and advances candidate applications', async () => {
    http.post.mockResolvedValue({ data: { id: 5, stage: 'applied' } });
    http.patch.mockResolvedValue({ data: { id: 5, stage: 'offer', rating: 4 } });

    await createCandidateApplication({ job_posting_id: 1, candidate_id: 2 });
    expect(http.post).toHaveBeenCalledWith('/hr/candidate-applications', {
      job_posting_id: 1,
      candidate_id: 2,
    });

    const advanced = await updateCandidateApplication(5, { stage: 'offer', rating: 4 });
    expect(http.patch).toHaveBeenCalledWith('/hr/candidate-applications/5', {
      stage: 'offer',
      rating: 4,
    });
    expect(advanced.stage).toBe('offer');
  });

  it('reads the pipeline summary', async () => {
    http.get.mockResolvedValue({ data: { applied: 3, interview: 1 } });

    const summary = await getPipelineSummary();

    expect(http.get).toHaveBeenCalledWith('/hr/pipeline-summary');
    expect(summary.applied).toBe(3);
  });
});
