import hubBookIconUrl from '../assets/home-hub-icon-book.png'
import hubFolderIconUrl from '../assets/home-hub-icon-folder.png'
import hubTagIconUrl from '../assets/home-hub-icon-tag.png'
import hubLogoUrl from '../assets/home-hub-logo.png'
import hubWordmarkUrl from '../assets/home-hub-wordmark.png'
import searchDoodleIconUrl from '../assets/home-search-doodle.png'
import type { HomeBrowseNavId } from './HomeBrowseNav'

type Props = {
  onSelectView: (id: HomeBrowseNavId) => void
  onOpenAccount: () => void
  onOpenSearch: () => void
}

const VIEW_ITEMS: {
  id: HomeBrowseNavId
  label: string
  icon: string
}[] = [
  { id: 'links', label: '책 뷰', icon: hubBookIconUrl },
  { id: 'books', label: '파일 뷰', icon: hubFolderIconUrl },
  { id: 'tags', label: '태그 뷰', icon: hubTagIconUrl },
]

export function HomeHubScreen({
  onSelectView,
  onOpenAccount,
  onOpenSearch,
}: Props) {
  return (
    <div className="home-hub">
      <div className="home-hub-brand">
        <img
          src={hubLogoUrl}
          alt="두들노트"
          className="home-hub-logo"
          width={400}
          height={251}
          decoding="async"
        />
        <img
          src={hubWordmarkUrl}
          alt="Reading journal"
          className="home-hub-wordmark"
          width={551}
          height={342}
          decoding="async"
        />
      </div>
      <nav className="home-hub-nav" aria-label="보기 선택">
        <div className="home-hub-views">
          {VIEW_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="home-hub-view-btn"
              aria-label={item.label}
              onClick={() => onSelectView(item.id)}
            >
              <img
                src={item.icon}
                alt=""
                className="home-hub-view-icon"
                width={160}
                height={160}
                decoding="async"
              />
            </button>
          ))}
        </div>
        <div className="home-hub-footer">
          <button
            type="button"
            className="home-hub-account"
            onClick={onOpenAccount}
          >
            나의 계정
          </button>
          <button
            type="button"
            className="home-hub-search"
            aria-label="검색"
            onClick={onOpenSearch}
          >
            <img
              src={searchDoodleIconUrl}
              alt=""
              className="home-hub-search-icon"
              width={36}
              height={36}
              decoding="async"
            />
          </button>
        </div>
      </nav>
    </div>
  )
}
