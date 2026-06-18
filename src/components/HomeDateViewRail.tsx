import type { ComponentType, RefObject } from 'react'
import type { NoteWithTags } from '../lib/notesApi'
import type { NotesByDateGroup } from '../lib/noteDateUtils'

type InlineNotesPanelProps = {
  tagLabel: string
  tagId: string
  notes: NoteWithTags[]
  loading: boolean
  onView: (note: NoteWithTags, contextTagId?: string | null) => void
  onTagFilter?: (tagId: string) => void
}

type Props = {
  groups: NotesByDateGroup[]
  selectedDateKey: string | null
  scrollRef: RefObject<HTMLDivElement | null>
  openTracksRef: RefObject<HTMLDivElement | null>
  slotRef: (dateKey: string, el: HTMLButtonElement | null) => void
  InlineNotesPanel: ComponentType<InlineNotesPanelProps>
  onSelectDate: (dateKey: string) => void
  onViewNote: (note: NoteWithTags, contextTagId?: string | null) => void
  onTagFilter: (tagId: string) => void
}

export function HomeDateViewRail({
  groups,
  selectedDateKey,
  scrollRef,
  openTracksRef,
  slotRef,
  InlineNotesPanel,
  onSelectDate,
  onViewNote,
  onTagFilter,
}: Props) {
  return (
    <div className="tag-view-rail-layout date-view-rail-layout">
      <div
        ref={scrollRef}
        className="tag-view-bar-scroll"
        aria-label="날짜 목록"
      >
        <div className="tag-view-bar-list" role="list">
          {groups.length === 0 ? (
            <p className="notes-hint date-view-empty">메모가 없습니다.</p>
          ) : (
            groups.map((group) => {
              const isSelected = selectedDateKey === group.dateKey
              return (
                <div
                  key={group.dateKey}
                  className="tag-view-bar-block"
                  role="listitem"
                >
                  <button
                    type="button"
                    ref={(el) => slotRef(group.dateKey, el)}
                    className={`tag-view-bar${
                      isSelected ? ' tag-view-bar--selected' : ''
                    }`}
                    aria-pressed={isSelected}
                    aria-expanded={isSelected}
                    aria-label={group.label}
                    title={group.label}
                    onClick={() => onSelectDate(group.dateKey)}
                  >
                    <span className="tag-view-bar-label">{group.label}</span>
                    <span className="tag-view-bar-stat">{group.notes.length}</span>
                  </button>
                  {isSelected ? (
                    <div
                      ref={openTracksRef}
                      className="tag-view-bar-notes"
                      aria-label={`${group.label} 메모`}
                    >
                      <InlineNotesPanel
                        tagLabel={group.label}
                        tagId={group.dateKey}
                        notes={group.notes}
                        loading={false}
                        onView={onViewNote}
                        onTagFilter={onTagFilter}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
