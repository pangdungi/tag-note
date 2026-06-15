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

type MenuRect = {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

type Props = {
  id?: string
  value: string
  options: ModalSelectOption[]
  onChange: (value: string) => void
  emptyLabel?: string
  disabled?: boolean
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
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null)

  const selectedLabel =
    value === ''
      ? emptyLabel
      : (options.find((o) => o.value === value)?.label ?? emptyLabel)

  const updateMenuRect = useCallback(() => {
    const el = triggerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const gap = 6
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8
    const spaceAbove = rect.top - gap - 8
    const preferredMax = Math.min(240, window.innerHeight * 0.42)
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      96,
      Math.min(preferredMax, openUp ? spaceAbove : spaceBelow),
    )

    setMenuRect(
      openUp
        ? {
            bottom: window.innerHeight - rect.top + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
          }
        : {
            top: rect.bottom + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
          },
    )
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null)
      return
    }
    updateMenuRect()
    window.addEventListener('resize', updateMenuRect)
    window.addEventListener('scroll', updateMenuRect, true)
    return () => {
      window.removeEventListener('resize', updateMenuRect)
      window.removeEventListener('scroll', updateMenuRect, true)
    }
  }, [open, updateMenuRect, options.length, emptyLabel])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        rootRef.current?.contains(target) ||
        document.getElementById(listId)?.contains(target)
      ) {
        return
      }
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
    open && menuRect
      ? createPortal(
          <ul
            id={listId}
            role="listbox"
            className="modal-select-menu modal-select-menu--floating"
            aria-labelledby={id}
            style={{
              position: 'fixed',
              top: menuRect.top,
              bottom: menuRect.bottom,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
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
                      <span
                        className="modal-select-option-check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )
      : null

  return (
    <div
      ref={rootRef}
      className={`modal-select${open ? ' modal-select--open' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="modal-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((cur) => !cur)}
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
      {menu}
    </div>
  )
}
