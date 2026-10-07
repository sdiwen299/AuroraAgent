import { useDroppable } from '@dnd-kit/core';
import type React from 'react';
import { KANBAN_COLUMNS } from '@/types/application';
import type { Application, ApplicationStatus } from '@/types/application';
import { GHOST_ID_PREFIX } from './applicationLifecycle';
import KanbanCard from './KanbanCard';
import styles from './KanbanBoard.module.css';

interface KanbanColumnProps {
  status: ApplicationStatus;
  label: string;
  color: string;
  cards: Application[];
  activeId: number | null;
  onOpenDetail?: (app: Application) => void;
  onRequestStatusChange: (app: Application, status: ApplicationStatus) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  decorative?: boolean;
}

export default function KanbanColumn({
  status,
  label,
  color,
  cards,
  activeId,
  onOpenDetail,
  onRequestStatusChange,
  expanded,
  onToggleExpanded,
  decorative = false,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: decorative ? `${GHOST_ID_PREFIX}${status}` : status });
  const imageByStatus: Record<ApplicationStatus, string> = {
    pending: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80',
    applied: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
    written_test: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
    interview: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80',
    offer: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80',
    closed: 'https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=900&q=80',
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.column} ${expanded ? styles.columnExpanded : ''} ${isOver && activeId !== null ? styles.columnOver : ''}`}
      style={{ '--column-color': color } as React.CSSProperties}
    >
      {expanded ? (
        <>
          <button type="button" className={`${styles.columnGalleryFace} ${styles.columnGallerySide}`} onClick={onToggleExpanded} aria-label={`左侧图片，收起${label}列表`}>
            <img src={imageByStatus[status]} alt="" loading="lazy" />
            <span className={styles.columnGalleryNumber}>{String(KANBAN_COLUMNS.indexOf(status) + 1).padStart(2, '0')}</span>
          </button>
          <div className={styles.columnExpandedCenter}>
            <button type="button" className={styles.columnExpandedHeader} onClick={onToggleExpanded} aria-expanded="true">
              <strong>{label}</strong>
              <span>{cards.length} 条投递</span>
            </button>
            <div className={styles.columnBody}>
              {cards.length === 0 ? <div className={styles.emptyColumn}>暂无{label}的投递</div> : cards.map((card) => <KanbanCard key={card.id} record={card} decorative={decorative} isDragging={activeId === card.id} onOpenDetail={onOpenDetail} onRequestStatusChange={onRequestStatusChange} />)}
            </div>
          </div>
          <button type="button" className={`${styles.columnGalleryFace} ${styles.columnGallerySide} ${styles.columnGallerySideRight}`} onClick={onToggleExpanded} aria-label={`右侧图片，收起${label}列表`}>
            <img src={imageByStatus[status]} alt="" loading="lazy" />
          </button>
        </>
      ) : (
        <button type="button" className={styles.columnGalleryFace} onClick={onToggleExpanded} aria-label={`展开${label}列表`} aria-expanded="false">
          <img src={imageByStatus[status]} alt="" loading="lazy" />
          <span className={styles.columnGalleryNumber}>{String(KANBAN_COLUMNS.indexOf(status) + 1).padStart(2, '0')}</span>
          <strong>{label}</strong>
        </button>
      )}
    </div>
  );
}
