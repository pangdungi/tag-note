import {
  TAG_RAIL_INDEX_EN,
  TAG_RAIL_INDEX_ETC,
  TAG_RAIL_INDEX_KO,
  railIndexHasItems,
  tagRailIndexLabel,
  type TagRailIndexKey,
} from '../lib/tagUtils'

type HomeBrowseRailIndexProps = {
  items: readonly { name?: string; title?: string }[]
  itemNoun: '태그' | '상위태그' | '출처'
  onSelect: (key: TagRailIndexKey) => void
}

function IndexGroup({
  keys,
  items,
  itemNoun,
  onSelect,
}: {
  keys: readonly TagRailIndexKey[]
  items: readonly { name?: string; title?: string }[]
  itemNoun: string
  onSelect: (key: TagRailIndexKey) => void
}) {
  return (
    <div className="tag-rail-index-group">
      {keys.map((key) => {
        const hasItems = railIndexHasItems(items, key)
        const label = tagRailIndexLabel(key)
        const ariaLabel =
          key === '#'
            ? `숫자·기호로 시작하는 ${itemNoun}`
            : `${label}로 시작하는 ${itemNoun}`
        return (
          <button
            key={key}
            type="button"
            className={`tag-rail-index-item${
              hasItems ? '' : ' tag-rail-index-item--empty'
            }`}
            disabled={!hasItems}
            aria-label={ariaLabel}
            onClick={() => onSelect(key)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function HomeBrowseRailIndex({
  items,
  itemNoun,
  onSelect,
}: HomeBrowseRailIndexProps) {
  return (
    <nav className="tag-rail-index" aria-label={`${itemNoun} 목록 빠른 이동`}>
      <IndexGroup
        keys={TAG_RAIL_INDEX_ETC}
        items={items}
        itemNoun={itemNoun}
        onSelect={onSelect}
      />
      <span className="tag-rail-index-divider" aria-hidden="true" />
      <IndexGroup
        keys={TAG_RAIL_INDEX_KO}
        items={items}
        itemNoun={itemNoun}
        onSelect={onSelect}
      />
      <span className="tag-rail-index-divider" aria-hidden="true" />
      <IndexGroup
        keys={TAG_RAIL_INDEX_EN}
        items={items}
        itemNoun={itemNoun}
        onSelect={onSelect}
      />
    </nav>
  )
}
