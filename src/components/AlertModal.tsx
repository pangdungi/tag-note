import { useId } from 'react'

type Props = {
  open: boolean
  title: string
  message: string
  closeLabel?: string
  onClose: () => void
}

export function AlertModal({
  open,
  title,
  message,
  closeLabel = '닫기',
  onClose,
}: Props) {
  const titleId = useId()
  const descId = useId()

  if (!open) return null

  return (
    <div className="confirm-modal-overlay" role="presentation">
      <div
        className="tag-manage-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="tag-manage-dialog confirm-modal-dialog alert-modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="confirm-modal-body">
          <h2 id={titleId} className="alert-modal-title">
            {title}
          </h2>
          <p id={descId} className="alert-modal-message">
            {message}
          </p>
        </div>
        <div className="alert-modal-actions">
          <button type="button" className="setup-retry" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
