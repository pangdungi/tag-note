import { useId } from 'react'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 위험 동작(삭제 등)이면 붉은 강조 확인 버튼 */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  const descId = useId()

  if (!open) return null

  return (
    <div className="confirm-modal-overlay" role="presentation">
      <div className="tag-manage-backdrop" aria-hidden="true" />
      <div
        className="tag-manage-dialog confirm-modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="confirm-modal-body">
          <h2 id={titleId} className="confirm-modal-title">
            {title}
          </h2>
          <p id={descId} className="confirm-modal-message">
            {message}
          </p>
          <div className="confirm-modal-actions">
            <button
              type="button"
              className="btn btn--quiet"
              disabled={busy}
              onClick={() => onCancel()}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={
                danger ? 'btn btn--danger' : 'btn btn--emphasis'
              }
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
