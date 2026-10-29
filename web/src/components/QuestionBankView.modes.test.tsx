// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@/types/question';

vi.mock('@/services/questions', () => ({
  listQuestions: vi.fn().mockResolvedValue([]),
  listDueQuestions: vi.fn().mockResolvedValue([]),
  getPracticeStats: vi.fn().mockResolvedValue({ total: 0, new: 0, practicing: 0, mastered: 0, due: 0, today_reviews: 0, streak_days: 0 }),
  createQuestion: vi.fn(), deleteQuestion: vi.fn(), generateQuestions: vi.fn(), submitReview: vi.fn(), updateQuestion: vi.fn(),
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    Popconfirm: ({ children, onConfirm }: { children: ReactNode; onConfirm?: () => void }) => (
      <span onClick={() => onConfirm?.()}>{children}</span>
    ),
  };
});

const { default: QuestionBankView } = await import('./QuestionBankView');
const questionService = await import('@/services/questions');
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element) => getComputedStyle(element);

const dueQuestion: Question = {
  id: 41,
  category: '系统设计',
  difficulty: 'medium',
  question: '如何设计一个限流器？',
  reference_answer: '令牌桶。',
  question_type: 'subjective',
  tags: ['限流'],
  source_type: 'manual',
  status: 'new',
  practice_count: 0,
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
};

const secondQuestion: Question = {
  id: 42,
  category: '数据库',
  difficulty: 'hard',
  question: '解释一下 MVCC 的实现原理？',
  reference_answer: '多版本并发控制。',
  question_type: 'subjective',
  tags: ['数据库'],
  source_type: 'template',
  status: 'practicing',
  practice_count: 2,
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
};

// 该 jsdom 环境未内置 localStorage，用内存实现补齐答题页草稿持久化。
function installLocalStorage() {
  if (window.localStorage) {
    window.localStorage.clear();
    return;
  }
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  installLocalStorage();
  window.matchMedia = () => ({ matches: false, addListener: () => undefined, removeListener: () => undefined }) as unknown as MediaQueryList;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.mocked(questionService.listQuestions).mockResolvedValue([]);
  vi.mocked(questionService.listDueQuestions).mockResolvedValue([]);
  vi.mocked(questionService.getPracticeStats).mockResolvedValue({
    total: 0,
    new: 0,
    practicing: 0,
    mastered: 0,
    due: 0,
    today_reviews: 0,
    streak_days: 0,
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

async function waitFor(assertion: () => void) {
  let error: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      assertion();
      return;
    } catch (nextError) {
      error = nextError;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
  }
  throw error;
}

function findButton(label: string, scope: ParentNode = document.body) {
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')];
  return buttons.find((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label)
    ?? buttons.find((item) => item.textContent?.includes(label));
}

function clickButton(label: string, scope: ParentNode = document.body) {
  const button = findButton(label, scope);
  if (!button) throw new Error(`Missing button: ${label}`);
  act(() => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.click();
  });
}

function clickMode(label: string) {
  const item = [...host.querySelectorAll<HTMLElement>('.ant-segmented-item')]
    .find((candidate) => candidate.textContent === label);
  if (!item) throw new Error(`Missing mode: ${label}`);
  act(() => item.click());
}

function setInput(selector: string, value: string) {
  const input = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!input) throw new Error(`Missing input: ${selector}`);
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function saveModal() {
  await waitFor(() => expect(document.body.querySelector('.ant-modal-footer .ant-btn-primary')).toBeTruthy());
  const button = document.body.querySelector<HTMLButtonElement>('.ant-modal-footer .ant-btn-primary');
  if (!button) throw new Error('Missing modal save button');
  act(() => button.click());
}

describe('QuestionBankView question-bank and spaced-review owner', () => {
  it('keeps only the bank and today review surfaces', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
    const mode = (label: string) => [...host.querySelectorAll<HTMLElement>('.ant-segmented-item')]
      .find((item) => item.textContent === label);
    expect(mode('题库')).toBeTruthy();
    expect(mode('今日复习')).toBeTruthy();
    expect(mode('复盘训练')).toBeFalsy();
    expect(mode('快速练习')).toBeFalsy();
    expect(host.querySelector('[data-testid="interview-readiness-center"]')).toBeNull();
    expect(host.querySelector('[data-testid="adaptive-practice-workspace"]')).toBeNull();

    act(() => mode('今日复习')?.click());
    expect(host.querySelector<HTMLElement>('[aria-label="今日复习模式"]')?.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>('[aria-label="题库模式"]')?.hidden).toBe(true);
  });

  it('opens today review when the top-level starts a new brushing session', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView practiceRequestToken={1} /></QueryClientProvider>));
    expect(host.querySelector<HTMLElement>('[aria-label="今日复习模式"]')?.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>('[aria-label="题库模式"]')?.hidden).toBe(true);
  });

  it('refreshes a prewarmed empty review queue after manually creating a question', async () => {
    vi.mocked(questionService.listDueQuestions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([dueQuestion]);
    vi.mocked(questionService.createQuestion).mockResolvedValue(dueQuestion);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
    await waitFor(() => expect(questionService.listDueQuestions).toHaveBeenCalledTimes(1));

    clickButton('手动添加', host);
    await waitFor(() => expect(document.body.querySelector('#question')).toBeTruthy());
    setInput('#question', dueQuestion.question);
    await saveModal();

    await waitFor(() => expect(questionService.createQuestion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(questionService.listDueQuestions).toHaveBeenCalledTimes(2));
    clickMode('今日复习');
    expect(host.textContent).toContain(dueQuestion.question);
  });

  it('refreshes the review queue after editing and deleting a question', async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue([dueQuestion]);
    vi.mocked(questionService.updateQuestion).mockResolvedValue(dueQuestion);
    vi.mocked(questionService.deleteQuestion).mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
    await waitFor(() => expect(host.textContent).toContain(dueQuestion.question));
    await waitFor(() => expect(questionService.listDueQuestions).toHaveBeenCalledTimes(1));

    clickButton('编辑题目', host);
    await waitFor(() => expect(document.body.querySelector('#question')).toBeTruthy());
    await saveModal();
    await waitFor(() => expect(questionService.updateQuestion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(questionService.listDueQuestions).toHaveBeenCalledTimes(2));

    clickButton('删除题目', host);
    await waitFor(() => expect(questionService.deleteQuestion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(questionService.listDueQuestions).toHaveBeenCalledTimes(3));
  });

  it('opens a self-assessment answer page from a question and records a review', async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue([dueQuestion]);
    vi.mocked(questionService.submitReview).mockResolvedValue(dueQuestion);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
    await waitFor(() => expect(host.textContent).toContain(dueQuestion.question));

    const stem = host.querySelector<HTMLElement>(`[aria-label="进入答题：${dueQuestion.question}"]`);
    expect(stem).toBeTruthy();
    act(() => stem?.click());

    await waitFor(() => expect(host.querySelector('[aria-label="题目答题页"]')).toBeTruthy());
    expect(host.textContent).toContain('你的作答');
    expect(host.textContent).not.toContain(dueQuestion.reference_answer);

    clickButton('显示参考答案');
    await waitFor(() => expect(host.textContent).toContain(dueQuestion.reference_answer));

    setInput('[aria-label="作答输入"]', '我的作答内容');
    clickButton('掌握');
    await waitFor(() => expect(questionService.submitReview).toHaveBeenCalledWith(dueQuestion.id, 3, '我的作答内容'));
  });

  it('navigates between questions and preserves per-question drafts', async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue([dueQuestion, secondQuestion]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
    await waitFor(() => expect(host.textContent).toContain(secondQuestion.question));

    act(() => host.querySelector<HTMLElement>(`[aria-label="进入答题：${dueQuestion.question}"]`)?.click());
    await waitFor(() => expect(host.textContent).toContain('第 1 / 2 题'));

    setInput('[aria-label="作答输入"]', '限流草稿');
    await waitFor(() =>
      expect(host.querySelector<HTMLTextAreaElement>('[aria-label="作答输入"]')?.value).toBe('限流草稿'),
    );

    clickButton('下一题');
    await waitFor(() => expect(host.textContent).toContain('第 2 / 2 题'));
    expect(host.textContent).toContain(secondQuestion.question);
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="作答输入"]')?.value).toBe('');

    setInput('[aria-label="作答输入"]', 'MVCC 草稿');
    clickButton('上一题');
    await waitFor(() => expect(host.textContent).toContain('第 1 / 2 题'));
    expect(host.textContent).toContain(dueQuestion.question);
    await waitFor(() =>
      expect(host.querySelector<HTMLTextAreaElement>('[aria-label="作答输入"]')?.value).toBe('限流草稿'),
    );

    clickButton('下一题');
    await waitFor(() =>
      expect(host.querySelector<HTMLTextAreaElement>('[aria-label="作答输入"]')?.value).toBe('MVCC 草稿'),
    );
  });
});
