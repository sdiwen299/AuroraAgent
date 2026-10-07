import { useEffect, useState, type ReactNode } from 'react';
import { CloseOutlined, SwapOutlined } from '@ant-design/icons';
import styles from '../dashboard.module.css';

export interface TodayBoardCard {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  content: ReactNode;
}

interface Props {
  boards: TodayBoardCard[];
}

export default function TodayBoardsGallery({ boards }: Props) {
  const [selectedBoard, setSelectedBoard] = useState<TodayBoardCard | null>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!selectedBoard) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedBoard(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedBoard]);

  const openBoard = (board: TodayBoardCard) => {
    setSelectedBoard(board);
    setFlipped(false);
  };

  const closeBoard = () => {
    setSelectedBoard(null);
    setFlipped(false);
  };

  return (
    <section className={styles.todayBoardsSection} aria-labelledby="today-boards-title">
      <div className={styles.todayBoardsHeader}>
        <div>
          <span className={styles.weeklyProgressEyebrow}>今日工作台</span>
          <h2 id="today-boards-title" className={styles.sectionHeading}>把重点看板放在手边</h2>
        </div>
        <span className={styles.todayBoardsHint}>点击卡片放大，翻面查看看板</span>
      </div>
      <div className={styles.todayBoardsDome}>
        {boards.map((board, index) => (
          <button
            key={board.id}
            type="button"
            className={styles.todayBoardTile}
            onClick={() => openBoard(board)}
            aria-label={`打开${board.title}看板`}
          >
            <img src={board.image} alt="" loading="lazy" />
            <span className={styles.todayBoardTileShade} />
            <span className={styles.todayBoardTileNumber}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.todayBoardTileCopy}>
              <small>{board.eyebrow}</small>
              <strong>{board.title}</strong>
              <span>{board.description}</span>
            </span>
          </button>
        ))}
      </div>

      {selectedBoard ? (
        <div className={styles.todayBoardsOverlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBoard();
        }}>
          <div className={styles.todayBoardsDialog} role="dialog" aria-modal="true" aria-labelledby="today-board-dialog-title">
            <button type="button" className={styles.todayBoardsClose} onClick={closeBoard} aria-label="关闭看板">
              <CloseOutlined />
            </button>
            <div className={`${styles.todayBoardCard} ${flipped ? styles.todayBoardCardFlipped : ''}`}>
              <div className={styles.todayBoardCardFace}>
                <img src={selectedBoard.image} alt="" />
                <div className={styles.todayBoardCardCaption}>
                  <span>{selectedBoard.eyebrow}</span>
                  <h3 id="today-board-dialog-title">{selectedBoard.title}</h3>
                  <p>{selectedBoard.description}</p>
                </div>
              </div>
              <div className={`${styles.todayBoardCardFace} ${styles.todayBoardCardBack}`}>
                <span className={styles.weeklyProgressEyebrow}>{selectedBoard.eyebrow}</span>
                <h3>{selectedBoard.title}</h3>
                <div className={styles.todayBoardCardContent}>{selectedBoard.content}</div>
              </div>
            </div>
            <button type="button" className={styles.todayBoardsFlipButton} onClick={() => setFlipped((value) => !value)}>
              <SwapOutlined />
              {flipped ? '查看图片' : '查看看板'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
