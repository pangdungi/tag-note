export type ModalSegmentTab = {
  id: string
  label: string
}

type ModalSegmentTabsProps = {
  tabs: readonly ModalSegmentTab[]
  activeId: string
  onChange: (id: string) => void
  ariaLabel?: string
}

export function ModalSegmentTabs({
  tabs,
  activeId,
  onChange,
  ariaLabel = '옵션',
}: ModalSegmentTabsProps) {
  return (
    <div className="modal-segment-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`modal-segment-tab${
              selected ? ' modal-segment-tab--active' : ''
            }`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
