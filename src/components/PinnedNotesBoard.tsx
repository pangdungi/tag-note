import type { ReactNode } from 'react'

type Props = {
  error: string | null
  onBack: () => void
  children: ReactNode
}

export function PinnedNotesBoard({ error, onBack, children }: Props) {
  return (
    <div className="pinned-notes-board">
      <header className="pinned-notes-board-head">
        <button type="button" className="home-hub-back" onClick={onBack}>
          뒤로
        </button>
        <h1 className="pinned-notes-board-title">고정된 메모</h1>
      </header>
      {error ? (
        <p className="notes-hint" role="alert">
          {error}
        </p>
      ) : null}
      <div className="folder-memos-view folder-memos-view--scroll pinned-notes-board-scroll">
        <div className="folder-memos-scroll folder-memos-scroll--sheet">
          {children}
        </div>
      </div>
    </div>
  )
}
