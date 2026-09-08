/**
 * The per-row coexist opt-ins carried by the picker forms
 * (`ConnectSelectionForm`, WhatsApp's `PhoneNumberSelectionSection`). Two
 * nested subsets — `aiReadsSyncedHistoryIds ⊆ coexistIds ⊆ selectedIds` — are
 * kept by dropping ids from the narrower list when the wider one loses them,
 * never by a validation error the operator would have to fix. Both helpers
 * take the parent list as their second argument, so the same pair enforces
 * both levels.
 */

/** Adds or removes one row's id, preserving the existing order. */
export function toggleCoexistId(
  coexistIds: readonly string[],
  id: string,
  enabled: boolean,
): string[] {
  if (!enabled) {
    return coexistIds.filter((coexistId) => coexistId !== id)
  }
  return coexistIds.includes(id) ? [...coexistIds] : [...coexistIds, id]
}

/**
 * Drops every id whose parent row no longer qualifies — a coexist id whose
 * row was unchecked, or an "AI reads synced history" id whose row stopped
 * syncing. Turning the parent back on therefore starts from a fresh, OFF
 * switch instead of silently restoring an earlier opt-in.
 */
export function dropUnselectedCoexistIds(
  ids: readonly string[],
  parentIds: readonly string[],
): string[] {
  return ids.filter((id) => parentIds.includes(id))
}
