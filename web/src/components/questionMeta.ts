import type { QuestionDifficulty, QuestionSource, QuestionStatus, QuestionType } from '@/types/question';

export const QUESTION_TYPE_META: Record<QuestionType, { label: string; color: string }> = {
  subjective: { label: '问答题', color: 'default' },
  choice: { label: '选择题', color: 'blue' },
  programming: { label: '编程题', color: 'purple' },
};

/** 兼容历史数据：缺失或非法的 question_type 一律按问答题处理。 */
export function questionTypeOf(question: { question_type?: QuestionType }): QuestionType {
  const value = question.question_type;
  return value === 'choice' || value === 'programming' ? value : 'subjective';
}

/** 单选题选项字母，与后端 correct_answer 的取值保持一致。 */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const DIFFICULTY_META: Record<QuestionDifficulty, { label: string; color: string }> = {
  easy: { label: '简单', color: 'green' },
  medium: { label: '中等', color: 'gold' },
  hard: { label: '困难', color: 'red' },
};

export const STATUS_META: Record<QuestionStatus, { label: string; color: string }> = {
  new: { label: '未刷', color: 'default' },
  practicing: { label: '练习中', color: 'blue' },
  mastered: { label: '已掌握', color: 'green' },
};

export const SOURCE_META: Record<QuestionSource, { label: string; color: string }> = {
  manual: { label: '手动', color: 'default' },
  ai_notes: { label: '面试复盘', color: 'blue' },
  ai_knowledge: { label: '知识库', color: 'cyan' },
  template: { label: '模板题库', color: 'magenta' },
};
