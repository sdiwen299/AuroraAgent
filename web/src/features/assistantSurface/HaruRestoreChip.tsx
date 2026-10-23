import { UndoOutlined } from '@ant-design/icons';
import styles from './HaruRestoreChip.module.css';

interface Props {
  onRestore: () => void;
}

/** 助手被隐藏后留在原位的回收入口：不再依赖设置页才能把它叫回来。 */
export default function HaruRestoreChip({ onRestore }: Props) {
  return (
    <div className={styles.slot}>
      <button
        type="button"
        className={styles.chip}
        onClick={onRestore}
        aria-label="显示 AI 助手"
        title="显示 AI 助手"
      >
        <UndoOutlined aria-hidden="true" />
      </button>
    </div>
  );
}
