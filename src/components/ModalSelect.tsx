import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export type ModalSelectOption = {
  value: string
  label: string
}

type Props = {
  id?: string
  value: string
  options: ModalSelectOption[]
  onChange: (value: string) => void
  emptyLabel?: string
  disabled?: boolean
}

type MenuLayout = {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

export function ModalSelect({
  id,
  value,
  options,
  onChange,
  emptyLabel = '선택',
  disabled = false,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null)
  const [dialogEl, setDialogEl] = useState<HTMLElement | null>(null)

  const selectedLabel =
    value === ''
      ? emptyLabel
      : (options.find((o) => o.value === value)?.label ?? emptyLabel)

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current
    const root = rootRef.current
    if (!trigger || !root) return

    const gap = 6
    const dialog = root.closest('.tag-manage-dialog') as HTMLElement | null
    if (!dialog) return

    setDialogEl(dialog)

    const dialogRect = dialog.getBoundingClientRect()
    const triggerRect = trigger.getBoundingClientRect()
    const footer = dialog.querySelector('.tag-manage-footer')
    const bottomLimit = footer?.getBoundingClientRect().top ?? dialogRect.bottom

    const spaceBelow = bottomLimit - triggerRect.bottom - gap - 8
    const spaceAbove = triggerRect.top - dialogRect.top - gap - 8
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      96,
      Math.min(240, openUp ? spaceAbove : spaceBelow),
    )

    setMenuLayout({
      left: triggerRect.left - dialogRect.left,
      width: triggerRect.width,
      top: openUp ? undefined : triggerRect.bottom - dialogRect.top + gap,
      bottom: openUp
        ? dialogRect.bottom - triggerRect.top + gap
        : undefined,
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuLayout()
    window.addEventListener('resize', updateMenuLayout)
    window.addEventListener('scroll', updateMenuLayout, true)
    return () => {
      window.removeEventListener('resize', updateMenuLayout)
      window.removeEventListener('scroll', updateMenuLayout, true)
    }
  }, [open, updateMenuLayout, options.length, emptyLabel])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      const menu = document.getElementById(listId)
      if (menu?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, listId])

  const allOptions: ModalSelectOption[] = [
    { value: '', label: emptyLabel },
    ...options,
  ]

  const menu =
    open && menuLayout && dialogEl ? (
      <ul
        id={listId}
        role="listbox"
        className="modal-select-menu modal-select-menu--dialog"
        aria-labelledby={id}
        style={{
          position: 'absolute',
          left: menuLayout.left,
          width: menuLayout.width,
          top: menuLayout.top,
          bottom: menuLayout.bottom,
          maxHeight: menuLayout.maxHeight,
        }}
      >
        {allOptions.map((option) => {
          const selected = option.value === value
          return (
            <li key={option.value || '__empty'} role="none">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`modal-select-option${
                  selected ? ' modal-select-option--selected' : ''
                }`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span className="modal-select-option-label">
                  {option.label}
                </span>
                {selected ? (
                  <span className="modal-select-option-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    ) : null

  return (
    <div ref={rootRef} className={`modal-select${open ? ' modal-select--open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="modal-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          setOpen((cur) => {
            const next = !cur
            if (next) {
              queueMicrotask(() => updateMenuLayout())
            }
            return next
          })
        }}
      >
        <span className="modal-select-value">{selectedLabel}</span>
        <svg
          className="modal-select-chevron"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {menu && dialogEl ? createPortal(menu, dialogEl) : null}
    </div>
  )
}
