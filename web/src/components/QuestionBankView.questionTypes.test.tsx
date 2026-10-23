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

const choiceQuestion: Question = {
  id: 61,
  category: '计算机网络',
  difficulty: 'medium',
  question: '下列关于 TCP 三次握手的说法，正确的是？',
  reference_answer: '**正确答案：B**\n\n三次握手的核心目的是同步双方序列号。',
  question_type: 'choice',
  options: ['只握一次即可建立连接', '需要三次交互同步序列号', '第三次握手不携带 SYN', '握手失败无需重传'],
  correct_answer: 'B',
  tags: ['网络'],
  source_type: 'template',
  status: 'new',
  practice_count: 0,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
};

const programmingQuestion: Question = {
  id: 62,
  category: '数据结构',
  difficulty: 'medium',
  question: '反转单链表并返回新的头节点。',
  reference_answer: '### 参考实现\n\n迭代三指针。',
  question_type: 'programming',
  starter_code: 'def reverse(head):\n    pass\n',
  language: 'python',
  tags: ['链表'],
  source_type: 'template',
  status: 'new',
  practice_count: 0,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
};

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
    total: 0, new: 0, practicing: 0, mastered: 0, due: 0, today_reviews: 0, streak_days: 0,
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

function tileLabels(): string[] {
  return [...host.querySelectorAll('[aria-label^="进入题库"]')].map(
    (item) => item.getAttribute('aria-label') ?? '',
  );
}

async function openAnswerPage(question: Question) {
  vi.mocked(questionService.listQuestions).mockResolvedValue([question]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
  await waitFor(() => expect(host.textContent).toContain(question.question));
  act(() => host.querySelector<HTMLElement>(`[aria-label="进入答题：${question.question}"]`)?.click());
  await waitFor(() => expect(host.querySelector('[aria-label="题目答题页"]')).toBeTruthy());
}

describe('question types in the bank and answer page', () => {
  it('filters the popular bank by question type', async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue([choiceQuestion, programmingQuestion]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));
    clickMode('热门题库');

    await waitFor(() => expect(tileLabels().length).toBeGreaterThan(0));
    const labels = tileLabels();
    expect(labels.some((label) => label.includes('选择题 · '))).toBe(true);
    expect(labels.some((label) => label.includes('编程题 · '))).toBe(true);

    const typeBar = host.querySelector('[aria-label="题型筛选"]');
    expect(typeBar).toBeTruthy();
    clickButton('编程题', typeBar as ParentNode);
    await waitFor(() => expect(tileLabels().some((label) => label.includes('编程题 · '))).toBe(true));
    expect(tileLabels().some((label) => label.includes('选择题 · '))).toBe(false);
  });

  it('lets a choice question be answered, submitted, and checked in', async () => {
    vi.mocked(questionService.submitReview).mockResolvedValue(choiceQuestion);
    await openAnswerPage(choiceQuestion);

    expect(host.textContent).toContain('选择答案');
    expect(host.querySelector('[aria-label="选项 B"]')).toBeTruthy();
    expect(host.textContent).not.toContain('回答正确');

    act(() => host.querySelector<HTMLButtonElement>('[aria-label="选项 B"]')?.click());
    expect(host.querySelector('[aria-label="选项 B"]')?.getAttribute('aria-checked')).toBe('true');

    clickButton('提交答案');
    await waitFor(() => expect(host.textContent).toContain('回答正确'));
    expect(host.textContent).toContain('答案解析');
    expect(host.textContent).toContain('正确答案：B');

    clickButton('掌握');
    await waitFor(() =>
      expect(questionService.submitReview).toHaveBeenCalledWith(choiceQuestion.id, 3, 'B'),
    );
  });

  it('reports a wrong choice submission and still allows a check-in', async () => {
    vi.mocked(questionService.submitReview).mockResolvedValue(choiceQuestion);
    await openAnswerPage(choiceQuestion);

    act(() => host.querySelector<HTMLButtonElement>('[aria-label="选项 A"]')?.click());
    clickButton('提交答案');
    await waitFor(() => expect(host.textContent).toContain('回答错误'));
    expect(host.textContent).toContain('正确答案是 B');

    clickButton('模糊');
    await waitFor(() =>
      expect(questionService.submitReview).toHaveBeenCalledWith(choiceQuestion.id, 2, 'A'),
    );
  });

  it('prefills the code editor for programming questions and reveals the reference on submit', async () => {
    vi.mocked(questionService.submitReview).mockResolvedValue(programmingQuestion);
    await openAnswerPage(programmingQuestion);

    const editor = host.querySelector<HTMLTextAreaElement>('[aria-label="代码编辑器输入"]');
    expect(editor).toBeTruthy();
    expect(editor?.value).toBe(programmingQuestion.starter_code);
    expect(host.textContent).toContain('python');
    expect(host.textContent).not.toContain('参考实现');

    setInput('[aria-label="代码编辑器输入"]', 'def reverse(head):\n    prev = None\n');
    clickButton('提交代码');
    await waitFor(() => expect(host.textContent).toContain('参考实现'));
    expect(host.textContent).toContain('迭代三指针。');

    clickButton('掌握');
    await waitFor(() =>
      expect(questionService.submitReview).toHaveBeenCalledWith(
        programmingQuestion.id,
        3,
        'def reverse(head):\n    prev = None\n',
      ),
    );
  });

  it('keeps type-specific form fields hidden until their type is chosen', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<QueryClientProvider client={queryClient}><QuestionBankView /></QueryClientProvider>));

    clickButton('手动添加', host);
    await waitFor(() => expect(document.body.querySelector('.ant-modal-footer .ant-btn-primary')).toBeTruthy());
    expect(document.body.textContent).toContain('题型');
    expect(findButton('添加选项')).toBeUndefined();
  });
});
