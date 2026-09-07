/**
 * Shared "select all" logic behind `ConnectSelectionHeader`'s checkbox — used
 * by both the shared picker form (`ConnectSelectionForm`) and WhatsApp's own
 * phone-number section (`PhoneNumberSelectionSection`), which otherwise
 * duplicated the same cap/toggle rules. A pure derivation (no React state or
 * lifecycle of its own), so it is a plain function rather than a `use`-
 * prefixed hook.
 */
export type SelectAllStateOptions = {
  /** Every selectable id, in provider order. */
  ids: readonly string[]
  /** The most this selection is ever allowed to hold. */
  max: number
  selected: readonly string[]
  onChange: (ids: string[]) => void
}

export type SelectAllState = {
  /** Reflects what a Select-all click actually produces (capped at `max`), not literally every id — so the header checkbox still shows checked when there are more ids than the cap allows. */
  allSelected: boolean
  /** No selectable ids at all. */
  disabled: boolean
  toggleAll: (checked: boolean) => void
}

export function selectAllState({
  ids,
  max,
  selected,
  onChange,
}: SelectAllStateOptions): SelectAllState {
  const selectableCount = Math.min(ids.length, max)
  const allSelected =
    selectableCount > 0 &&
    selected.length === selectableCount &&
    selected.every((id) => ids.includes(id))

  const toggleAll = (checked: boolean) => {
    onChange(checked ? ids.slice(0, max) : [])
  }

  return { allSelected, disabled: ids.length === 0, toggleAll }
}
