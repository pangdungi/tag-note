import tagNavIconUrl from '../assets/home-nav-tag-icon.png'
import bookNavIconUrl from '../assets/home-nav-book-icon.png'
import linkNavIconUrl from '../assets/home-nav-link-icon.png'
import calendarNavIconUrl from '../assets/home-nav-calendar-icon.png'
import eyeNavIconUrl from '../assets/home-nav-eye-icon.png'

import type { HomeBrowseNavMode } from '../lib/tagUtils'

export type HomeBrowseNavId = HomeBrowseNavMode

const NAV_ITEMS: {
  id: HomeBrowseNavId
  label: string
  title: string
  icon: string
}[] = [
  { id: 'tags', label: '태그', title: '태그별 보기', icon: tagNavIconUrl },
  { id: 'books', label: '책', title: '상위 태그별 보기', icon: bookNavIconUrl },
  { id: 'links', label: '출처', title: '출처별 보기', icon: linkNavIconUrl },
  { id: 'dates', label: '날짜', title: '날짜별 보기', icon: calendarNavIconUrl },
]

type HomeBrowseNavButtonsProps = {
  activeId: HomeBrowseNavId | null
  disabled?: boolean
  onSelect: (id: HomeBrowseNavId) => void
}

export function HomeBrowseNavButtons({
  activeId,
  disabled = false,
  onSelect,
}: HomeBrowseNavButtonsProps) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`btn btn--icon${
            activeId === item.id ? ' btn--active' : ''
          }`}
          aria-label={item.label}
          title={item.title}
          aria-pressed={activeId === item.id}
          disabled={disabled}
          onClick={() => onSelect(item.id)}
        >
          <img
            src={item.icon}
            alt=""
            className="btn--icon-img"
            width={20}
            height={20}
            decoding="async"
          />
        </button>
      ))}
    </>
  )
}

type HomeMobileBrowseFabProps = {
  open: boolean
  activeId: HomeBrowseNavId | null
  disabled?: boolean
  onToggle: () => void
  onSelect: (id: HomeBrowseNavId) => void
}

export function HomeMobileBrowseFab({
  open,
  activeId,
  disabled = false,
  onToggle,
  onSelect,
}: HomeMobileBrowseFabProps) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="home-browse-fab-backdrop"
          aria-label="탐색 메뉴 닫기"
          onClick={onToggle}
        />
      ) : null}
      <div
        className={`home-browse-fab-menu${open ? ' home-browse-fab-menu--open' : ''}`}
        aria-hidden={open ? undefined : true}
      >
        <HomeBrowseNavButtons
          activeId={activeId}
          disabled={disabled}
          onSelect={onSelect}
        />
      </div>
      <button
        type="button"
        className={`btn btn--icon home-browse-fab-trigger${
          open ? ' btn--active' : ''
        }`}
        aria-label={open ? '탐색 메뉴 닫기' : '탐색 메뉴 열기'}
        title={open ? '탐색 메뉴 닫기' : '탐색'}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={onToggle}
      >
        <img
          src={eyeNavIconUrl}
          alt=""
          className="btn--icon-img"
          width={20}
          height={20}
          decoding="async"
        />
      </button>
    </>
  )
}
