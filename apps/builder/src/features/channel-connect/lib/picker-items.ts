import type { ReactNode } from "react"

/**
 * One selectable row on the picker (`ConnectSelectionForm`) and one row in
 * the status dialog (`AccountStatusList`). Channel pickers (phases 3–5) map
 * their provider-specific shape (Facebook Page, Instagram account, WhatsApp
 * phone number) down to this before handing it to the shared components.
 */
export type ConnectPickerItem = {
  /** Stable id used everywhere the operator's selection order matters. */
  id: string
  name: string
  /** Secondary line — page id / @username / phone number. */
  secondary?: string
  disabled?: boolean
  /** Shown next to the option when disabled (e.g. "Already connected"). */
  disabledReason?: string
  /** Avatar image, or a channel `InboxIcon` — rendered before the name. */
  leading?: ReactNode
  /**
   * The row's coexist opt-in, set by the picker's per-row switch. When true,
   * the connect flow runs coexist for this row right after it connects
   * (`useConnectBatch`'s `afterConnect`); the switch itself only exists on
   * coexist-eligible channels (`isCoexistChannel`).
   */
  coexist?: boolean
  /**
   * This row's "AI reads synced history" answer, only meaningful when
   * `coexist` is true. Per row, not per batch: it is a property of the
   * account's own history.
   */
  aiReadsSyncedHistory?: boolean
}

/**
 * The batch hook and the dialog only need id + name (`useConnectBatch`'s
 * `TItem extends { id: string; name: string }`); this alias documents that
 * requirement without forcing every caller to import `ConnectPickerItem`
 * (which also carries picker-only presentation fields).
 */
export type ConnectTarget = Pick<
  ConnectPickerItem,
  "id" | "name" | "coexist" | "aiReadsSyncedHistory"
>

/**
 * Marks every provider item already connected elsewhere. Channel pickers map
 * their provider list down to `{ ...item, isAlreadyConnected }` with this
 * before deciding disabled/selectable state — shared so Messenger/Instagram
 * (and WhatsApp's own equivalent) never re-implement the same
 * `connectedIds.has(id)` check.
 */
export function markAlreadyConnected<TItem extends { id: string }>(
  items: readonly TItem[],
  connectedIds: ReadonlySet<string>,
  getId: (item: TItem) => string = (item) => item.id,
): (TItem & { isAlreadyConnected: boolean })[] {
  return items.map((item) => ({
    ...item,
    isAlreadyConnected: connectedIds.has(getId(item)),
  }))
}

/**
 * Picker ordering shared by every channel: selectable items first, then
 * not-connectable ones (e.g. missing admin permission), then items already
 * connected elsewhere. Nothing is hidden — a disabled row still renders with
 * its reason — so every item needs a rank. `Array.prototype.sort` is stable,
 * so the provider's own order survives within a rank.
 */
export function rankPickerItem(item: {
  isConnectable: boolean
  isAlreadyConnected: boolean
}): number {
  if (item.isAlreadyConnected) {
    return 2
  }
  return item.isConnectable ? 0 : 1
}
