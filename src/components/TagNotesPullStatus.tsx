type Props = {
  /** 태그 선택 후 서버 동기화 중 */
  active: boolean
  /** 로컬에 이미 보여 줄 메모가 있으면 목록 위에 얇은 인디케이터만 */
  hasCachedNotes: boolean
}

/** 태그별 메모 패널 — 텍스트 대신 쉬머·스켈레톤으로 동기화 상태 표시 */
export function TagNotesPullStatus({
  active,
  hasCachedNotes,
}: Props) {
  if (!active) return null

  return (
    <>
      <span className="sr-only">
        선택한 태그 메모를 서버와 맞추는 중입니다.
      </span>
      {hasCachedNotes ? (
        <div className="tag-notes-pull-strip" aria-hidden>
          <div className="tag-notes-pull-strip__glow" />
        </div>
      ) : (
        <div className="tag-notes-skeleton-stack" aria-hidden>
          {(['a', 'b', 'c'] as const).map((k) => (
            <div key={k} className="tag-notes-skeleton-bone">
              <div className="tag-notes-skeleton-bone__tags">
                <span />
                <span />
              </div>
              <div className="tag-notes-skeleton-bone__line tag-notes-skeleton-bone__line--lg" />
              <div className="tag-notes-skeleton-bone__line tag-notes-skeleton-bone__line--mid" />
              <div className="tag-notes-skeleton-bone__line tag-notes-skeleton-bone__line--short" />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
