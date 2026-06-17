import { useId, useMemo } from 'react'
import { ModalSelect } from './ModalSelect'
import type { TagRow } from '../lib/notesApi'
import {
  displayTagName,
  getParentTags,
  type TagParentLink,
} from '../lib/tagUtils'

type Props = {
  allTags: TagRow[]
  tagParentLinks?: TagParentLink[]
  value: string
  onChange: (parentId: string) => void
  disabled?: boolean
}

export function MemoParentTagSelect({
  allTags,
  tagParentLinks,
  value,
  onChange,
  disabled = false,
}: Props) {
  const fieldId = useId()

  const options = useMemo(
    () =>
      getParentTags(allTags, tagParentLinks).map((t) => ({
        value: t.id,
        label: displayTagName(t.name),
      })),
    [allTags, tagParentLinks],
  )

  return (
    <div className="composer-field">
      <label className="composer-label" htmlFor={fieldId}>
        상위 태그
      </label>
      <ModalSelect
        id={fieldId}
        value={value}
        options={options}
        emptyLabel="없음 (상위 미지정)"
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
