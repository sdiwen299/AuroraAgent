import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  createQuestion,
  deleteQuestion,
  generateQuestions,
  getPracticeStats,
  listDueQuestions,
  listQuestions,
  submitReview,
  updateQuestion,
} from '@/services/questions';
import type {
  Question,
  QuestionDifficulty,
  QuestionInput,
  QuestionSource,
  QuestionStatus,
  QuestionType,
  ReviewRating,
} from '@/types/question';
import boardImage from '../jpg/board.png';
import dashboardImage from '../jpg/dashboard.png';
import interviewImage from '../jpg/interview.png';
import offersImage from '../jpg/offers.png';
import resumesImage from '../jpg/resumes.png';
import DriftWall from './DriftWall';
import QuestionAnswerPage from './QuestionAnswerPage';
import {
  DIFFICULTY_META,
  OPTION_LETTERS,
  QUESTION_TYPE_META,
  SOURCE_META,
  STATUS_META,
  questionTypeOf,
} from './questionMeta';
import styles from './QuestionBankView.module.css';

const { Paragraph } = Typography;

const QUESTION_WALL_IMAGES = [boardImage, dashboardImage, interviewImage, offersImage, resumesImage];

interface QuestionBankViewProps {
  focusId?: number;
  practiceRequestToken?: number;
}

export default function QuestionBankView({
  focusId,
  practiceRequestToken,
}: QuestionBankViewProps) {
  const [tab, setTab] = useState<'question_bank' | 'popular' | 'review'>(practiceRequestToken ? 'review' : 'question_bank');
  const [templateTopic, setTemplateTopic] = useState('');
  const [templateBankOnly, setTemplateBankOnly] = useState(false);
  const [activeQueue, setActiveQueue] = useState<Question[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastPracticeRequestTokenRef = useRef<number | undefined>(practiceRequestToken);

  const activeQuestion = activeQueue[activeIndex] ?? null;

  const openQuestion = (question: Question, queue: Question[]) => {
    const index = queue.findIndex((item) => item.id === question.id);
    setActiveQueue(queue);
    setActiveIndex(index >= 0 ? index : 0);
  };

  const closeQuestion = () => {
    setActiveQueue([]);
    setActiveIndex(0);
  };

  // When launched from a mock-interview drill link, surface the target id.
  useEffect(() => {
    if (focusId) {
      message.info(`正在定位题目 #${focusId}，可在题库中按 ID 查找`);
    }
  }, [focusId]);

  useEffect(() => {
    const previous = lastPracticeRequestTokenRef.current;
    lastPracticeRequestTokenRef.current = practiceRequestToken;
    if (practiceRequestToken !== undefined && practiceRequestToken > 0 && practiceRequestToken > (previous ?? 0)) {
      setTab('review');
    }
  }, [practiceRequestToken]);

  if (activeQuestion) {
    return (
      <QuestionAnswerPage
        question={activeQuestion}
        position={{ index: activeIndex, total: activeQueue.length }}
        onPrev={activeIndex > 0 ? () => setActiveIndex((index) => index - 1) : undefined}
        onNext={
          activeIndex < activeQueue.length - 1
            ? () => setActiveIndex((index) => index + 1)
            : undefined
        }
        onBack={closeQuestion}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>题库刷题</h1>
          <p className={styles.subtitle}>基于已记录的面试问题生成题目，管理题库，按间隔复习巩固面试知识</p>
        </div>
        <Segmented
          value={tab}
          onChange={(v) => {
            const next = v as 'question_bank' | 'popular' | 'review';
            if (next !== 'question_bank') setTemplateBankOnly(false);
            setTab(next);
          }}
          options={[
            { label: '题库', value: 'question_bank' },
            { label: '热门题库', value: 'popular' },
            { label: '今日复习', value: 'review' },
          ]}
        />
      </div>

      <section hidden={tab !== 'question_bank'} aria-label="题库模式">
        <BankTab
          key={`${templateBankOnly ? 'template' : 'all'}-${templateTopic || 'all'}`}
          initialSourceType={templateBankOnly ? 'template' : undefined}
          initialTopic={templateTopic}
          onOpenQuestion={openQuestion}
        />
      </section>
      <section hidden={tab !== 'popular'} aria-label="热门笔试题库">
        <PopularBanksTab
          onOpenQuestion={openQuestion}
          onOpenBank={() => {
            setTemplateTopic('');
            setTemplateBankOnly(true);
            setTab('question_bank');
          }}
          onPractice={() => setTab('review')}
        />
      </section>
      <section hidden={tab !== 'review'} aria-label="今日复习模式"><PracticeTab /></section>
    </div>
  );
}

/* ----------------------------- 题库 tab ----------------------------- */

function BankTab({
  initialSourceType,
  initialTopic,
  onOpenQuestion,
}: {
  initialSourceType?: QuestionSource;
  initialTopic?: string;
  onOpenQuestion: (question: Question, queue: Question[]) => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<QuestionStatus | 'all'>('all');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | 'all'>('all');
  const [sourceType, setSourceType] = useState<QuestionSource | 'all'>(initialSourceType ?? 'all');
  const [questionType, setQuestionType] = useState<QuestionType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const filter = useMemo(
    () => ({
      ...(status !== 'all' ? { status } : {}),
      ...(difficulty !== 'all' ? { difficulty } : {}),
      ...(sourceType !== 'all' ? { source_type: sourceType } : {}),
      ...(questionType !== 'all' ? { question_type: questionType } : {}),
      ...(initialTopic ? { topic: initialTopic } : {}),
    }),
    [status, difficulty, sourceType, questionType, initialTopic],
  );

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['questions', filter],
    queryFn: () => listQuestions(filter),
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter(
      (q) =>
        q.question.toLowerCase().includes(term) ||
        q.category.toLowerCase().includes(term) ||
        q.tags.some((t) => t.toLowerCase().includes(term)),
    );
  }, [questions, search]);

  const delMutation = useMutation({
    mutationFn: (id: number) => deleteQuestion(id),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-due'] });
    },
    onError: () => message.error('删除失败'),
  });

  if (generateOpen) {
    return <GenerateDrawer open={generateOpen} onClose={() => setGenerateOpen(false)} />;
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          className="op-ai-btn"
          onClick={() => setGenerateOpen(true)}
        >
          AI 生成题目
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => setManualOpen(true)}>
          手动添加
        </Button>
        <span className={styles.spacer} />
        <Input.Search
          placeholder="搜索题目 / 分类 / 标签"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          style={{ width: 120 }}
          aria-label="按状态筛选"
          options={[
            { label: '全部状态', value: 'all' },
            { label: '未刷', value: 'new' },
            { label: '练习中', value: 'practicing' },
            { label: '已掌握', value: 'mastered' },
          ]}
        />
        <Select
          value={sourceType}
          onChange={setSourceType}
          style={{ width: 130 }}
          aria-label="按来源筛选"
          options={[
            { label: '全部来源', value: 'all' },
            { label: '模板题库', value: 'template' },
            { label: '面试复盘', value: 'ai_notes' },
            { label: '知识库', value: 'ai_knowledge' },
            { label: '手动', value: 'manual' },
          ]}
        />
        <Select
          value={questionType}
          onChange={setQuestionType}
          style={{ width: 120 }}
          aria-label="按题型筛选"
          options={[
            { label: '全部题型', value: 'all' },
            { label: '问答题', value: 'subjective' },
            { label: '选择题', value: 'choice' },
            { label: '编程题', value: 'programming' },
          ]}
        />
        <Select
          value={difficulty}
          onChange={setDifficulty}
          style={{ width: 110 }}
          aria-label="按难度筛选"
          options={[
            { label: '全部难度', value: 'all' },
            { label: '简单', value: 'easy' },
            { label: '中等', value: 'medium' },
            { label: '困难', value: 'hard' },
          ]}
        />
      </div>

      {isLoading ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.qCard}>
              <Skeleton active paragraph={{ rows: 2 }} title={false} />
            </div>
          ))}
        </Space>
      ) : visible.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            questions.length === 0 ? '题库还是空的' : '没有符合条件的题目'
          }
          style={{ padding: '48px 0' }}
        >
          {questions.length === 0 && (
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              className="op-ai-btn"
              onClick={() => setGenerateOpen(true)}
            >
              从面试复盘生成题目，或手动添加
            </Button>
          )}
        </Empty>
      ) : (
        <div className={styles.qList}>
          {visible.map((q) => (
            <div key={q.id} className={styles.qCard}>
              <div className={styles.qMeta}>
                <Tag color={QUESTION_TYPE_META[questionTypeOf(q)].color}>
                  {QUESTION_TYPE_META[questionTypeOf(q)].label}
                </Tag>
                {q.category && <Tag color="purple">{q.category}</Tag>}
                <Tag color={DIFFICULTY_META[q.difficulty].color}>
                  {DIFFICULTY_META[q.difficulty].label}
                </Tag>
                <Tag color={STATUS_META[q.status].color}>{STATUS_META[q.status].label}</Tag>
                <Tag color={SOURCE_META[q.source_type].color}>{SOURCE_META[q.source_type].label}</Tag>
                {q.practice_count > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--op-muted)' }}>
                    刷题 {q.practice_count} 次
                  </span>
                )}
                <div className={styles.qActions}>
                  <Tooltip title="编辑">
                    <Button
                      type="text"
                      size="small"
                      aria-label="编辑题目"
                      icon={<EditOutlined />}
                      onClick={() => setEditing(q)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="删除这道题？"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => delMutation.mutate(q.id)}
                  >
                    <Tooltip title="删除">
                      <Button type="text" size="small" aria-label="删除题目" icon={<DeleteOutlined />} danger />
                    </Tooltip>
                  </Popconfirm>
                </div>
              </div>
              <div
                className={styles.qStem}
                onClick={() => onOpenQuestion(q, visible)}
                role="button"
                tabIndex={0}
                aria-label={`进入答题：${q.question}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenQuestion(q, visible);
                  }
                }}
              >
                {q.question}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuestionFormModal
        open={manualOpen || !!editing}
        question={editing}
        onClose={() => {
          setManualOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}

type PopularCategory = { key: string; label: string; keywords: string[] };

const POPULAR_CATEGORIES: PopularCategory[] = [
  { key: 'hot', label: '热门', keywords: [] },
  { key: 'backend', label: '后端', keywords: ['后端', 'java', 'spring', 'go', 'c++', 'python', 'php', 'redis', 'mysql', '系统设计'] },
  { key: 'frontend', label: '前端', keywords: ['前端', 'javascript', 'typescript', 'react', 'vue', 'html', 'css'] },
  { key: 'database', label: '数据库', keywords: ['数据库', 'mysql', 'redis', 'elasticsearch', 'mongodb'] },
  { key: 'network', label: '计算机网络', keywords: ['网络', 'http', 'tcp', '计算机网络'] },
  { key: 'os', label: '操作系统', keywords: ['操作系统', 'linux', '内核'] },
  { key: 'data', label: '数据结构', keywords: ['数据结构', '算法', '数组', '链表'] },
  { key: 'ai', label: '人工智能', keywords: ['人工智能', 'ai', '大模型', '机器学习'] },
  { key: 'project', label: '项目', keywords: ['项目', '场景', '实战'] },
  { key: 'all', label: '全部', keywords: [] },
];

function matchesPopularCategory(question: Question, category: PopularCategory): boolean {
  if (category.key === 'hot' || category.key === 'all') return true;
  const haystack = `${question.question} ${question.topic ?? ''} ${question.category} ${question.tags.join(' ')}`.toLowerCase();
  return category.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function PopularBanksTab({
  onOpenBank,
  onPractice,
  onOpenQuestion,
}: {
  onOpenBank: (topic: string) => void;
  onPractice: () => void;
  onOpenQuestion: (question: Question, queue: Question[]) => void;
}) {
  const [categoryKey, setCategoryKey] = useState('hot');
  const [typeKey, setTypeKey] = useState<QuestionType | 'all'>('all');
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['questions', { source_type: 'template' }],
    queryFn: () => listQuestions({ source_type: 'template' }),
  });

  const category = POPULAR_CATEGORIES.find((item) => item.key === categoryKey) ?? POPULAR_CATEGORIES[0];
  const categoryQuestions = questions.filter((question) => matchesPopularCategory(question, category));
  const typeCounts: Record<'all' | QuestionType, number> = {
    all: categoryQuestions.length,
    subjective: categoryQuestions.filter((q) => questionTypeOf(q) === 'subjective').length,
    choice: categoryQuestions.filter((q) => questionTypeOf(q) === 'choice').length,
    programming: categoryQuestions.filter((q) => questionTypeOf(q) === 'programming').length,
  };
  const visibleQuestions =
    typeKey === 'all'
      ? categoryQuestions
      : categoryQuestions.filter((question) => questionTypeOf(question) === typeKey);

  return (
    <div className={styles.popularPage}>
      <div className={styles.popularHeading}>
        <div>
          <span className={styles.popularEyebrow}>模板题库 · 知识检索同步</span>
          <h2 className={styles.popularTitle}>热门笔试题库</h2>
          <p className={styles.popularSubtitle}>按主题挑选题库，进入后直接开始刷题和间隔复习。</p>
        </div>
        <div className={styles.popularActions}>
          <Button icon={<BookOutlined />} onClick={() => onOpenBank('')}>浏览全部</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={onPractice}>复习错题</Button>
        </div>
      </div>

      <div className={styles.popularCategoryBar} role="tablist" aria-label="笔试题库分类">
        {POPULAR_CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === categoryKey}
            className={`${styles.popularCategory} ${item.key === categoryKey ? styles.popularCategorySelected : ''}`}
            onClick={() => setCategoryKey(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.popularTypeRow} role="tablist" aria-label="题型筛选">
        <span className={styles.popularTypeLabel}>题型</span>
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'choice', label: '选择题' },
            { key: 'programming', label: '编程题' },
            { key: 'subjective', label: '问答题' },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === typeKey}
            className={`${styles.popularTypeChip} ${item.key === typeKey ? styles.popularTypeChipSelected : ''}`}
            onClick={() => setTypeKey(item.key)}
          >
            {item.label}
            <span className={styles.popularTypeCount}>{typeCounts[item.key]}</span>
          </button>
        ))}
      </div>

      <div className={styles.popularRailHeader}>
        <div>
          <span className={styles.popularRailTitle}>{category.label}题库</span>
          <span className={styles.popularRailCount}>{visibleQuestions.length} 道题</span>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.popularEmpty}>正在加载模板题库…</div>
      ) : visibleQuestions.length === 0 ? (
        <div className={styles.popularEmpty}>
          <FileTextOutlined />
          <strong>
            {questions.length === 0
              ? '模板题目正在准备中'
              : typeKey === 'all'
                ? '这个分类暂时没有题目'
                : '这个分类下暂时没有该题型的题目'}
          </strong>
          <span>{questions.length === 0 ? '系统题目数据准备完成后会直接展示在这里。' : '切换其他分类或题型继续浏览。'}</span>
        </div>
      ) : (
        <div className={styles.popularDriftViewport}>
          <DriftWall
            items={visibleQuestions.map((question, index) => ({
              image: QUESTION_WALL_IMAGES[index % QUESTION_WALL_IMAGES.length],
              title: `${QUESTION_TYPE_META[questionTypeOf(question)].label} · ${question.topic ? `${question.topic}笔试题` : (question.category || '开源题库')} · ${question.question}`,
              onClick: () => onOpenQuestion(question, visibleQuestions),
            }))}
            columns={5}
            tileWidth={204}
            tileHeight={144}
            gap={16}
            radius={16}
            tilt={13}
            turn={-10}
            perspective={1260}
            depth={92}
            speed={22}
            direction="up"
            variance={0.3}
            parallax={0.45}
            lift={42}
            fade={0.28}
            dim={0.84}
            overlayColor="#20340f"
          />
        </div>
      )}
    </div>
  );
}

/* --------------------------- 生成抽屉 --------------------------- */

function GenerateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [source, setSource] = useState<'knowledge' | 'notes'>('notes');
  const [count, setCount] = useState(8);

  const genMutation = useMutation({
    mutationFn: () =>
      generateQuestions({
        source,
        count,
      }),
    onSuccess: (res) => {
      const extra = res.skipped > 0 ? `，跳过 ${res.skipped} 道重复` : '';
      message.success(`已生成 ${res.count} 道题${extra}`);
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-due'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        '生成失败，请检查 AI 配置';
      message.error(msg);
    },
  });

  if (!open) return null;

  return (
    <section aria-label="AI 生成题目">
      <div className={styles.layerHeader}>
        <div>
          <Button type="link" className={styles.backButton} onClick={onClose}>
            返回题库
          </Button>
          <h2 className={styles.layerTitle}>AI 生成题目</h2>
        </div>
      </div>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>来源</div>
          <Segmented
            block
            value={source}
            onChange={(v) => setSource(v as 'knowledge' | 'notes')}
            options={[
              { label: '参考资料（暂未开放）', value: 'knowledge', disabled: true },
              { label: '面试复盘真题', value: 'notes' },
            ]}
          />
        </div>

        {source === 'knowledge' && (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            参考资料出题暂未开放，可选择面试复盘或手动添加题目。
          </Paragraph>
        )}

        {source === 'notes' && (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            将从已记录的面试问题中提炼题目。参考资料出题暂未开放，可先手动添加题目。
          </Paragraph>
        )}

        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>生成数量</div>
          <InputNumber min={1} max={20} value={count} onChange={(v) => setCount(v ?? 8)} style={{ width: '100%' }} />
        </div>

        <Button
          type="primary"
          block
          className="op-ai-btn"
          icon={<ThunderboltOutlined />}
          loading={genMutation.isPending}
          onClick={() => genMutation.mutate()}
        >
          {genMutation.isPending ? 'AI 正在出题…' : '开始生成'}
        </Button>
        <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
          已存在的题目会自动去重（精确 + 近似），不会重复入库。
        </Paragraph>
      </Space>
    </section>
  );
}

/* --------------------------- 手动增/改 --------------------------- */

function QuestionFormModal({
  open,
  question,
  onClose,
}: {
  open: boolean;
  question: Question | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isEdit = !!question;
  const [questionType, setQuestionType] = useState<QuestionType>('subjective');
  const watchedOptions: string[] = Form.useWatch('options', form) ?? [];

  useEffect(() => {
    if (open) {
      const type = question ? questionTypeOf(question) : 'subjective';
      setQuestionType(type);
      form.setFieldsValue({
        question: question?.question ?? '',
        category: question?.category ?? '',
        difficulty: question?.difficulty ?? 'medium',
        reference_answer: question?.reference_answer ?? '',
        question_type: type,
        options: question?.options ?? [],
        correct_answer: question?.correct_answer ?? '',
        starter_code: question?.starter_code ?? '',
        language: question?.language ?? 'python',
        tags: question?.tags ?? [],
      });
    }
  }, [open, question, form]);

  const optionLetters = watchedOptions
    .slice(0, 8)
    .map((_, index) => OPTION_LETTERS[index])
    .filter((_, index) => (watchedOptions[index] ?? '').trim().length > 0);

  const saveMutation = useMutation({
    mutationFn: (values: QuestionInput) =>
      isEdit ? updateQuestion(question!.id, values) : createQuestion(values),
    onSuccess: () => {
      message.success(isEdit ? '已保存' : '已添加');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-due'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '保存失败';
      message.error(msg);
    },
  });

  return (
    <Modal
      title={isEdit ? '编辑题目' : '手动添加题目'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="保存"
      cancelText="取消"
      confirmLoading={saveMutation.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => saveMutation.mutate(values as QuestionInput)}
        onValuesChange={(changed) => {
          if ('question_type' in changed) setQuestionType(changed.question_type ?? 'subjective');
        }}
        style={{ marginTop: 12 }}
      >
        <Form.Item
          name="question"
          label="题目"
          rules={[{ required: true, message: '请输入题目' }]}
        >
          <Input.TextArea
            rows={questionType === 'programming' ? 4 : 2}
            placeholder={
              questionType === 'choice'
                ? '题干，例如：下列关于 HashMap 的说法正确的是？'
                : questionType === 'programming'
                  ? '题目描述、示例输入输出、数据范围（支持 Markdown）'
                  : '例如：什么是 goroutine 泄漏？如何排查？'
            }
          />
        </Form.Item>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="question_type" label="题型" style={{ width: 120 }}>
            <Select
              options={[
                { label: '问答题', value: 'subjective' },
                { label: '选择题', value: 'choice' },
                { label: '编程题', value: 'programming' },
              ]}
            />
          </Form.Item>
          <Form.Item name="category" label="分类" style={{ flex: 1 }}>
            <Input placeholder="如 Go并发 / 系统设计" />
          </Form.Item>
          <Form.Item name="difficulty" label="难度" style={{ width: 120 }}>
            <Select
              options={[
                { label: '简单', value: 'easy' },
                { label: '中等', value: 'medium' },
                { label: '困难', value: 'hard' },
              ]}
            />
          </Form.Item>
        </Space>

        {questionType === 'choice' && (
          <>
            <div className={styles.formBlockLabel}>
              选项 <span className={styles.formRequired}>*</span>
            </div>
            <Form.List
              name="options"
              rules={[
                {
                  validator: (_, value: string[] | undefined) =>
                    (value ?? []).filter((item) => item && item.trim()).length >= 2
                      ? Promise.resolve()
                      : Promise.reject(new Error('至少填写 2 个选项')),
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map((field, index) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 6 }}>
                      <span className={styles.optionLetter}>{OPTION_LETTERS[index]}</span>
                      <Form.Item
                        name={[field.name]}
                        rules={[{ required: true, message: '选项内容不能为空' }]}
                        style={{ marginBottom: 0, width: 360 }}
                      >
                        <Input placeholder={`选项 ${OPTION_LETTERS[index]}`} />
                      </Form.Item>
                      {fields.length > 2 && (
                        <Button type="text" danger size="small" onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      )}
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add('')}
                    disabled={fields.length >= 8}
                  >
                    添加选项
                  </Button>
                  <Form.ErrorList errors={errors} />
                </>
              )}
            </Form.List>
            <div style={{ height: 12 }} />
            <Form.Item
              name="correct_answer"
              label="正确答案"
              rules={[{ required: true, message: '请选择正确答案' }]}
            >
              <Select
                placeholder="选择正确选项"
                options={optionLetters.map((letter) => ({ label: `正确答案 ${letter}`, value: letter }))}
              />
            </Form.Item>
          </>
        )}

        {questionType === 'programming' && (
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="language" label="语言" style={{ width: 140 }}>
              <Select
                options={[
                  { label: 'Python', value: 'python' },
                  { label: 'Java', value: 'java' },
                  { label: 'Go', value: 'go' },
                  { label: 'C++', value: 'cpp' },
                  { label: 'JavaScript', value: 'javascript' },
                  { label: 'SQL', value: 'sql' },
                ]}
              />
            </Form.Item>
            <Form.Item name="starter_code" label="初始代码" style={{ flex: 1 }}>
              <Input.TextArea rows={4} placeholder="打开题目时预填的代码模板" />
            </Form.Item>
          </Space>
        )}

        <Form.Item name="tags" label="标签">
          <Select mode="tags" placeholder="回车添加标签" tokenSeparators={[',']} />
        </Form.Item>
        <Form.Item
          name="reference_answer"
          label={questionType === 'programming' ? '参考实现与思路' : questionType === 'choice' ? '答案解析' : '参考答案'}
        >
          <Input.TextArea rows={4} placeholder="要点式参考答案" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ----------------------------- 刷题打卡 tab ----------------------------- */

function PracticeTab() {
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [doneToday, setDoneToday] = useState(0);

  const { data: stats } = useQuery({
    queryKey: ['questions', 'stats'],
    queryFn: () => getPracticeStats(),
  });
  const { data: due = [], isLoading } = useQuery({
    queryKey: ['questions-due'],
    queryFn: () => listDueQuestions(40),
  });

  const current = due[0];

  const reviewMutation = useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: ReviewRating }) => submitReview(id, rating),
    onSuccess: () => {
      setRevealed(false);
      setDoneToday((n) => n + 1);
      qc.invalidateQueries({ queryKey: ['questions-due'] });
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: () => message.error('打卡失败'),
  });

  const rate = (rating: ReviewRating) => {
    if (!current || reviewMutation.isPending) return;
    reviewMutation.mutate({ id: current.id, rating });
  };

  // Keyboard shortcuts: space reveals, 1/2/3 rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (el && el.tagName === 'BUTTON') return;
      if (!current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        rate(Number(e.key) as ReviewRating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sessionTotal = doneToday + due.length;
  const progress = sessionTotal > 0 ? Math.round((doneToday / sessionTotal) * 100) : 0;
  const masteryRate =
    stats && stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;

  return (
    <>
      <div className={styles.statRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <ThunderboltOutlined /> 今日已刷
          </span>
          <span className={`${styles.statValue} op-tnum`}>{stats?.today_reviews ?? 0}</span>
          <span className={styles.statHint}>本次会话 {doneToday} 道</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <FireOutlined /> 连续打卡
          </span>
          <span className={`${styles.statValue} op-tnum`}>{stats?.streak_days ?? 0} 天</span>
          <span className={styles.statHint}>坚持就是胜利</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <BulbOutlined /> 已掌握
          </span>
          <span className={`${styles.statValue} op-tnum`}>{masteryRate}%</span>
          <span className={styles.statHint}>
            {stats?.mastered ?? 0} / {stats?.total ?? 0} 道
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>
            <ReloadOutlined /> 待复习
          </span>
          <span className={`${styles.statValue} op-tnum`}>{stats?.due ?? 0}</span>
          <span className={styles.statHint}>到期需要巩固</span>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.flash}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      ) : !current ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            (stats?.total ?? 0) === 0 ? '题库还是空的，先去生成一些题目吧' : '太棒了，今天的复习队列已清空'
          }
          style={{ padding: '56px 0' }}
        />
      ) : (
        <div className={styles.flash}>
          <div className={styles.qMeta}>
            <Tag color={QUESTION_TYPE_META[questionTypeOf(current)].color}>
              {QUESTION_TYPE_META[questionTypeOf(current)].label}
            </Tag>
            {current.category && <Tag color="purple">{current.category}</Tag>}
            <Tag color={DIFFICULTY_META[current.difficulty].color}>
              {DIFFICULTY_META[current.difficulty].label}
            </Tag>
            <Tag color={STATUS_META[current.status].color}>{STATUS_META[current.status].label}</Tag>
          </div>

          <div className={styles.flashStem}>{current.question}</div>

          {questionTypeOf(current) === 'choice' && (current.options ?? []).length > 0 && (
            <ul className={styles.flashOptions}>
              {(current.options ?? []).map((option, index) => {
                const letter = OPTION_LETTERS[index] ?? String(index + 1);
                const isCorrect = revealed && letter === (current.correct_answer ?? '').toUpperCase();
                return (
                  <li
                    key={letter}
                    className={`${styles.flashOption} ${isCorrect ? styles.flashOptionCorrect : ''}`}
                  >
                    <span className={styles.optionLetter}>{letter}</span>
                    <span>{option}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {revealed ? (
            <div className={styles.flashAnswer}>
              {questionTypeOf(current) === 'choice' && current.correct_answer && (
                <div className={styles.flashCorrect}>
                  正确答案：{current.correct_answer}
                  {(() => {
                    const letter = (current.correct_answer || '').toUpperCase();
                    const text = (current.options ?? [])[OPTION_LETTERS.indexOf(letter)];
                    return text ? ` · ${text}` : '';
                  })()}
                </div>
              )}
              {current.reference_answer || '（这道题暂无参考答案，凭记忆自评即可）'}
            </div>
          ) : (
            <Button size="large" onClick={() => setRevealed(true)} style={{ alignSelf: 'flex-start' }}>
              显示答案 <span className={styles.rateKey}>（空格）</span>
            </Button>
          )}

          <div className={styles.flashFooter}>
            <div className={styles.progressBar} aria-hidden>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
            {revealed && (
              <div className={styles.rateRow}>
                <button
                  className={`${styles.rateBtn} ${styles.rateAgain}`}
                  onClick={() => rate(1)}
                  disabled={reviewMutation.isPending}
                >
                  不会
                  <span className={styles.rateKey}>1 · 明天再练</span>
                </button>
                <button
                  className={`${styles.rateBtn} ${styles.rateHard}`}
                  onClick={() => rate(2)}
                  disabled={reviewMutation.isPending}
                >
                  模糊
                  <span className={styles.rateKey}>2 · 3 天后</span>
                </button>
                <button
                  className={`${styles.rateBtn} ${styles.rateGood}`}
                  onClick={() => rate(3)}
                  disabled={reviewMutation.isPending}
                >
                  掌握
                  <span className={styles.rateKey}>3 · 7 天后</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
