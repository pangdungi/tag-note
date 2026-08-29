import tagNavIconUrl from '../assets/home-nav-tag-icon.png'
import bookNavIconUrl from '../assets/home-nav-book-icon.png'
import backNavIconUrl from '../assets/home-nav-back-icon.png'
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
  { id: 'links', label: '출처', title: '출처별 보기', icon: linkNavIconUrl },
  { id: 'books', label: '파일', title: '폴더별 보기', icon: bookNavIconUrl },
  { id: 'tags', label: '태그', title: '태그별 보기', icon: tagNavIconUrl },
  { id: 'dates', label: '날짜', title: '날짜별 보기', icon: calendarNavIconUrl },
]

type HomeBrowseNavButtonsProps = {
  activeId: HomeBrowseNavId | null
  disabled?: boolean
  onSelect: (id: HomeBrowseNavId) => void
  /** 상위태그 spine 펼침 — 책 아이콘을 뒤로가기로 표시 */
  booksBackMode?: boolean
  onBooksBack?: () => void
  /** 출처 spine 펼침 — 출처 아이콘을 뒤로가기로 표시 */
  linksBackMode?: boolean
  onLinksBack?: () => void
}

export function HomeBrowseNavButtons({
  activeId,
  disabled = false,
  onSelect,
  booksBackMode = false,
  onBooksBack,
  linksBackMode = false,
  onLinksBack,
}: HomeBrowseNavButtonsProps) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isBooksBack = item.id === 'books' && booksBackMode
        const isLinksBack = item.id === 'links' && linksBackMode
        const isNavBack = isBooksBack || isLinksBack
        const isActive = activeId === item.id && !isNavBack
        const backLabel =
          item.id === 'books'
            ? '상위 태그 목록으로'
            : item.id === 'links'
              ? '출처 목록으로'
              : item.label
        const backTitle =
          item.id === 'books'
            ? '상위 태그 목록'
            : item.id === 'links'
              ? '출처 목록'
              : item.title
        return (
          <button
            key={item.id}
            type="button"
            className={`btn btn--icon${isActive ? ' btn--active' : ''}`}
            aria-label={isNavBack ? backLabel : item.label}
            title={isNavBack ? backTitle : item.title}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              if (isBooksBack) {
                onBooksBack?.()
                return
              }
              if (isLinksBack) {
                onLinksBack?.()
                return
              }
              onSelect(item.id)
            }}
          >
            <span className="home-browse-nav-icon-slot" aria-hidden="true">
              <img
                src={item.icon}
                alt=""
                className={`btn--icon-img home-browse-nav-icon${
                  isNavBack ? ' home-browse-nav-icon--out' : ''
                }`}
                width={20}
                height={20}
                decoding="async"
              />
              {item.id === 'books' || item.id === 'links' ? (
                <img
                  src={backNavIconUrl}
                  alt=""
                  className={`btn--icon-img home-browse-nav-icon home-browse-nav-icon--back${
                    isNavBack ? ' home-browse-nav-icon--in' : ''
                  }`}
                  width={20}
                  height={20}
                  decoding="async"
                />
              ) : null}
            </span>
          </button>
        )
      })}
    </>
  )
}

type HomeMobileBrowseFabProps = {
  open: boolean
  activeId: HomeBrowseNavId | null
  disabled?: boolean
  onToggle: () => void
  onSelect: (id: HomeBrowseNavId) => void
  booksBackMode?: boolean
  onBooksBack?: () => void
  linksBackMode?: boolean
  onLinksBack?: () => void
}

export function HomeMobileBrowseFab({
  open,
  activeId,
  disabled = false,
  onToggle,
  onSelect,
  booksBackMode = false,
  onBooksBack,
  linksBackMode = false,
  onLinksBack,
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
          booksBackMode={booksBackMode}
          onBooksBack={onBooksBack}
          linksBackMode={linksBackMode}
          onLinksBack={onLinksBack}
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
