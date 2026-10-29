import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Tag, message } from 'antd';
import {
  ArrowLeftOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  FormOutlined,
  HistoryOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { submitReview } from '@/services/questions';
import type { Question, ReviewRating } from '@/types/question';
import {
  DIFFICULTY_META,
  OPTION_LETTERS,
  QUESTION_TYPE_META,
  SOURCE_META,
  STATUS_META,
  questionTypeOf,
} from './questionMeta';
import styles from './QuestionAnswerPage.module.css';

function CopyablePre({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <pre ref={ref}>
      <button
        type="button"
        className={styles.copyBtn}
        aria-label="复制代码"
        onClick={async () => {
          const text = ref.current?.querySelector('code')?.textContent ?? '';
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
      {children}
    </pre>
  );
}

function MarkdownText({ children }: { children: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CopyablePre }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const RATE_ACTIONS: Array<{ rating: ReviewRating; label: string; hint: string; className: string }> = [
  { rating: 1, label: '不会', hint: '1 · 明天再练', className: styles.rateAgain },
  { rating: 2, label: '模糊', hint: '2 · 3 天后', className: styles.rateHard },
  { rating: 3, label: '掌握', hint: '3 · 7 天后', className: styles.rateGood },
];

const draftKey = (id: number) => `aurora:answer-draft:${id}`;

function readDraft(id: number): string {
  try {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(id: number, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (value.trim()) window.localStorage.setItem(draftKey(id), value);
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable */
  }
}

function initialAnswer(question: Question): string {
  const draft = readDraft(question.id);
  if (draft) return draft;
  return questionTypeOf(question) === 'programming' ? (question.starter_code ?? '') : '';
}

interface QuestionAnswerPageProps {
  question: Question;
  onBack: () => void;
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
}

export default function QuestionAnswerPage({
  question,
  onBack,
  position,
  onPrev,
  onNext,
}: QuestionAnswerPageProps) {
  const qc = useQueryClient();
  const questionType = questionTypeOf(question);
  const isChoice = questionType === 'choice';
  const isProgramming = questionType === 'programming';
  const [answer, setAnswer] = useState(() => initialAnswer(question));
  const [revealed, setRevealed] = useState(false);
  const previousIdRef = useRef(question.id);
  const skipWriteRef = useRef(false);

  // Reset the draft and reference answer when navigating to a different question.
  useEffect(() => {
    if (previousIdRef.current !== question.id) {
      previousIdRef.current = question.id;
      skipWriteRef.current = true;
      setAnswer(initialAnswer(question));
      setRevealed(false);
    }
  }, [question.id, question]);

  useEffect(() => {
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    // A programming answer identical to the starter template is not a draft;
    // drop it so a later server-side template update is not shadowed forever.
    if (isProgramming && answer === (question.starter_code ?? '')) writeDraft(question.id, '');
    else writeDraft(question.id, answer);
  }, [question.id, answer, isProgramming, question.starter_code]);

  const reviewMutation = useMutation({
    mutationFn: (rating: ReviewRating) => submitReview(question.id, rating, answer),
    onSuccess: () => {
      writeDraft(question.id, '');
      message.success('已记录打卡，题目复习计划已更新');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-due'] });
      qc.invalidateQueries({ queryKey: ['questions', 'stats'] });
      onBack();
    },
    onError: () => message.error('打卡失败，请稍后重试'),
  });

  const rate = (rating: ReviewRating) => {
    if (reviewMutation.isPending) return;
    reviewMutation.mutate(rating);
  };

  // Keyboard shortcuts: space reveals the reference answer, 1/2/3 record a rating.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      // Let focused buttons keep their native Enter/Space activation (option
      // selection and action buttons), otherwise the shortcut would swallow it.
      const onButton = !!el && el.tagName === 'BUTTON';
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        if (onButton) return;
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && (event.key === '1' || event.key === '2' || event.key === '3')) {
        event.preventDefault();
        rate(Number(event.key) as ReviewRating);
      } else if (event.key === 'ArrowLeft' && onPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hasReference = question.reference_answer.trim().length > 0;
  const progressPercent = position && position.total > 0
    ? Math.round(((position.index + 1) / position.total) * 100)
    : 0;

  const options = question.options ?? [];
  const selectedLetter = answer.trim().toUpperCase();
  const correctLetter = (question.correct_answer ?? '').toUpperCase();
  const choiceState: 'pending' | 'correct' | 'wrong' | 'empty' = !revealed
    ? 'pending'
    : !selectedLetter
      ? 'empty'
      : selectedLetter === correctLetter
        ? 'correct'
        : 'wrong';
  const typeMeta = QUESTION_TYPE_META[questionType];

  const submitChoice = () => {
    if (!selectedLetter) {
      message.warning('请先选择一个选项');
      return;
    }
    setRevealed(true);
  };

  const resetChoice = () => {
    setAnswer('');
    setRevealed(false);
  };

  const resetCode = () => {
    setAnswer(question.starter_code ?? '');
    setRevealed(false);
  };

  const referenceTitle = isChoice ? '答案解析' : isProgramming ? '参考实现' : '参考答案';
  const answerPlaceholder = isProgramming
    ? '在这里编写你的代码，提交后对照参考实现自评…'
    : '先写下自己的思路，再对照参考答案自评打卡…';

  return (
    <div className={styles.page} aria-label="题目答题页">
      <div className={styles.topBar}>
        <button type="button" className={styles.backLink} onClick={onBack}>
          <ArrowLeftOutlined /> 返回题库
        </button>
        {position && (
          <div className={styles.navigator}>
            <span className={styles.progressLabel}>
              第 {position.index + 1} / {position.total} 题
            </span>
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
            <div className={styles.navButtons}>
              <Button
                size="small"
                icon={<LeftOutlined />}
                disabled={!onPrev}
                onClick={onPrev}
                aria-label="上一题"
              >
                上一题
              </Button>
              <Button
                size="small"
                icon={<RightOutlined />}
                disabled={!onNext}
                onClick={onNext}
                aria-label="下一题"
              >
                下一题
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={`${styles.shell} ${isProgramming ? styles.shellOj : ''}`}>
        <div className={styles.metaRow}>
          <span className={styles.eyebrow}>答题</span>
          <Tag color={typeMeta.color}>{typeMeta.label}</Tag>
          {question.category && <Tag color="purple">{question.category}</Tag>}
          <Tag color={DIFFICULTY_META[question.difficulty].color}>
            {DIFFICULTY_META[question.difficulty].label}
          </Tag>
          <Tag color={STATUS_META[question.status].color}>{STATUS_META[question.status].label}</Tag>
          <Tag color={SOURCE_META[question.source_type].color}>
            {SOURCE_META[question.source_type].label}
          </Tag>
          {question.practice_count > 0 && (
            <span className={styles.practiceHint}>
              <HistoryOutlined /> 已刷 {question.practice_count} 次
            </span>
          )}
        </div>

        <article className={styles.stem}>
          <MarkdownText>{question.question}</MarkdownText>
        </article>

        {isChoice ? (
          <section className={styles.answerArea} aria-label="选项作答">
            <div className={styles.answerLabel}>
              <EditOutlined /> 选择答案
            </div>
            <div className={styles.optionList} role="radiogroup" aria-label="题目选项">
              {options.map((option, index) => {
                const letter = OPTION_LETTERS[index] ?? String(index + 1);
                const isSelected = selectedLetter === letter;
                const stateClass =
                  choiceState === 'pending' || choiceState === 'empty'
                    ? isSelected
                      ? styles.optionSelected
                      : ''
                    : letter === correctLetter
                      ? styles.optionCorrect
                      : isSelected
                        ? styles.optionWrong
                        : '';
                return (
                  <button
                    key={letter}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`选项 ${letter}`}
                    className={`${styles.option} ${stateClass}`}
                    disabled={revealed}
                    onClick={() => setAnswer(letter)}
                  >
                    <span className={styles.optionBadge}>{letter}</span>
                    <span className={styles.optionText}>{option}</span>
                    {choiceState !== 'pending' && letter === correctLetter && (
                      <CheckCircleOutlined className={styles.optionMarkOk} />
                    )}
                    {choiceState === 'wrong' && isSelected && (
                      <CloseCircleOutlined className={styles.optionMarkBad} />
                    )}
                  </button>
                );
              })}
            </div>
            {choiceState === 'correct' && (
              <div className={`${styles.banner} ${styles.bannerOk}`} role="status">
                <CheckCircleOutlined /> 回答正确，正确答案 {correctLetter}
              </div>
            )}
            {choiceState === 'wrong' && (
              <div className={`${styles.banner} ${styles.bannerBad}`} role="status">
                <CloseCircleOutlined /> 回答错误，正确答案是 {correctLetter || '见解析'}
              </div>
            )}
            {choiceState === 'empty' && (
              <div className={`${styles.banner} ${styles.bannerInfo}`} role="status">
                <BulbOutlined /> 尚未选择答案，先对照解析自评吧
              </div>
            )}
            <div className={styles.answerActions}>
              {revealed ? (
                <>
                  <span className={styles.answerHint}>已提交，键盘 1/2/3 可直接打卡</span>
                  <Button icon={<ReloadOutlined />} onClick={resetChoice}>
                    重新作答
                  </Button>
                </>
              ) : (
                <Button
                  type="primary"
                  className={styles.ncPrimary}
                  onClick={submitChoice}
                  aria-label="提交答案"
                >
                  提交答案
                </Button>
              )}
            </div>
          </section>
        ) : isProgramming ? (
          <section className={styles.codeSection} aria-label="代码作答">
            <div className={styles.editorCard}>
              <div className={styles.editorHeader}>
                <span className={styles.editorTitle}>
                  <CodeOutlined /> 代码编辑器
                </span>
                <span className={styles.editorLanguage}>{question.language || 'python'}</span>
              </div>
              <Input.TextArea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                autoSize={{ minRows: 12, maxRows: 26 }}
                className={styles.codeArea}
                spellCheck={false}
                placeholder="在这里编写你的代码…"
                aria-label="代码编辑器输入"
              />
            </div>
            <div className={styles.bannerInfo} role="status">
              <BulbOutlined /> 自练习模式：暂无在线判题，提交后对照参考代码与解析自评打卡。
            </div>
            <div className={styles.answerActions}>
              <span className={styles.answerHint}>
                {answer.split('\n').length} 行 · {answer.length} 字符
              </span>
              <Button icon={<ReloadOutlined />} onClick={resetCode}>
                重置代码
              </Button>
              {revealed ? (
                <Button icon={<EyeInvisibleOutlined />} onClick={() => setRevealed(false)}>
                  收起参考实现
                </Button>
              ) : (
                <Button
                  type="primary"
                  className={styles.ncPrimary}
                  icon={<RocketOutlined />}
                  onClick={() => setRevealed(true)}
                  aria-label="提交代码"
                >
                  提交代码
                </Button>
              )}
            </div>
          </section>
        ) : (
          <section className={styles.answerArea}>
            <div className={styles.answerLabel}>
              <EditOutlined /> 你的作答
            </div>
            <Input.TextArea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              autoSize={{ minRows: 5, maxRows: 12 }}
              placeholder={answerPlaceholder}
              aria-label="作答输入"
            />
            <div className={styles.answerActions}>
              <span className={styles.answerHint}>{answer.trim().length} 字</span>
              {revealed ? (
                <Button icon={<EyeInvisibleOutlined />} onClick={() => setRevealed(false)}>
                  隐藏参考答案
                </Button>
              ) : (
                <Button type="primary" icon={<BulbOutlined />} onClick={() => setRevealed(true)}>
                  显示参考答案
                </Button>
              )}
            </div>
          </section>
        )}

        {revealed && (
          <section className={styles.reference}>
            <div className={styles.referenceHeader}>
              <FormOutlined /> {referenceTitle}
            </div>
            <div className={styles.referenceBody}>
              {isChoice && correctLetter && (
                <div className={styles.correctLine}>
                  正确答案：<strong>{correctLetter}</strong>
                  {options[OPTION_LETTERS.indexOf(correctLetter)] &&
                    `　${options[OPTION_LETTERS.indexOf(correctLetter)]}`}
                </div>
              )}
              {hasReference ? (
                <MarkdownText>{question.reference_answer}</MarkdownText>
              ) : (
                <span className={styles.referenceEmpty}>（这道题暂无参考答案，凭记忆自评即可）</span>
              )}
            </div>
          </section>
        )}

        <footer className={styles.footer}>
          <div className={styles.footerLabel}>
            <BulbOutlined /> 自评并打卡
          </div>
          {revealed ? (
            <div className={styles.rateRow}>
              {RATE_ACTIONS.map((action) => (
                <button
                  key={action.rating}
                  type="button"
                  className={`${styles.rateBtn} ${action.className}`}
                  disabled={reviewMutation.isPending}
                  onClick={() => rate(action.rating)}
                >
                  {action.label}
                  <span className={styles.rateKey}>{action.hint}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.hintRow}>
              <BulbOutlined /> 先{isChoice ? '提交答案' : isProgramming ? '提交代码' : '显示参考答案'}
              ，再按空格或点击进行三档自评打卡。
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
