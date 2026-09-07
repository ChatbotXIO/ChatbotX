"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo } from "react"
import type {
  Control,
  FieldPath,
  FieldValues,
  PathValue,
  UseFormSetValue,
} from "react-hook-form"
import { useWatch } from "react-hook-form"
import {
  CoexistOptionsPanel,
  coexistRowTrailing,
} from "../components/coexist-controls"
import {
  dropUnselectedCoexistIds,
  toggleCoexistId,
} from "../lib/coexist-selection"
import type { MessageKey } from "../lib/message-key"

/** Stable empty defaults, so an unset field never hands `useMemo` a fresh identity every render. */
const NO_IDS: string[] = []

/** Which fields of the caller's form hold the selection and the two coexist opt-ins. Referenced through `UseCoexistSelectionOptions`. */
type CoexistSelectionNames<TValues extends FieldValues> = {
  selectedIds: FieldPath<TValues>
  coexistIds: FieldPath<TValues>
  aiReadsSyncedHistoryIds: FieldPath<TValues>
}

export type UseCoexistSelectionOptions<TValues extends FieldValues> = {
  control: Control<TValues>
  setValue: UseFormSetValue<TValues>
  names: CoexistSelectionNames<TValues>
  /**
   * Whether this connect can offer coexist at all. False for a channel whose
   * onboarding mode did not ask the provider for the coexistence flow
   * (WhatsApp: anything but "connect an existing WhatsApp Business Account"),
   * where the option would be a promise nothing can keep: no row switch, no
   * panel, and both id lists driven back to empty so the fan-out sends
   * `coexist: false`. Defaults to true — Messenger and Instagram are always
   * eligible.
   */
  enabled?: boolean
}

export type CoexistSelectionApi = {
  /** Always a subset of the current selection — safe to submit as-is. */
  coexistIds: string[]
  /** Always a subset of `coexistIds`. */
  aiReadsSyncedHistoryIds: string[]
  /**
   * The `trailing` node for one picker row (`CheckboxGroupField`'s option).
   * `null` for a row that cannot be selected at all (already connected
   * elsewhere, not an admin, …) — an opt-in for a row that will never be
   * connected is noise, so such rows carry nothing rather than a disabled
   * switch. Every picker goes through here, so none can drift on the rule.
   */
  trailingFor: (item: {
    id: string
    name: string
    disabled?: boolean
  }) => ReactNode
  /** The panel under the list — `null` until at least one row opted in. */
  panel: (descriptionKey: MessageKey) => ReactNode
}

/**
 * The per-row coexist opt-ins as one reusable piece of form state: the watched
 * fields, the nested `aiReadsSyncedHistoryIds ⊆ coexistIds ⊆ selectedIds`
 * invariant (kept by dropping ids, never by a validation error), and the
 * rendered controls. Both pickers — the shared `ConnectSelectionForm` and
 * WhatsApp's own `PhoneNumberSelectionSection`, which keeps its own form —
 * consume this, so the rules cannot drift between them.
 */
const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")

/**
 * `useWatch` on a generic form cannot be narrowed by the type system — every
 * field of `TValues` is possible. Narrowed at RUNTIME instead of cast: a
 * non-array (or a partially-hydrated) value degrades to the shared empty list
 * rather than lying about its type.
 */
function useWatchedIds<TValues extends FieldValues>(
  control: Control<TValues>,
  name: FieldPath<TValues>,
): string[] {
  const value: unknown = useWatch({ control, name })
  return isIdList(value) ? value : NO_IDS
}

export function useCoexistSelection<TValues extends FieldValues>({
  control,
  setValue,
  names,
  enabled = true,
}: UseCoexistSelectionOptions<TValues>): CoexistSelectionApi {
  const selectedIds = useWatchedIds(control, names.selectedIds)
  const storedCoexistIds = useWatchedIds(control, names.coexistIds)
  const storedAiIds = useWatchedIds(control, names.aiReadsSyncedHistoryIds)

  // Memoised so the sync effects below only run when the lists they narrow
  // actually changed, not on every unrelated render.
  const coexistIds = useMemo(
    () =>
      enabled
        ? dropUnselectedCoexistIds(storedCoexistIds, selectedIds)
        : NO_IDS,
    [enabled, storedCoexistIds, selectedIds],
  )
  const aiReadsSyncedHistoryIds = useMemo(
    () => dropUnselectedCoexistIds(storedAiIds, coexistIds),
    [storedAiIds, coexistIds],
  )

  const write = useCallback(
    // Unavoidable: `setValue` is typed per field path, and `TValues` is only
    // known to the caller — no narrowing can prove a generic path holds
    // `string[]`. The three names this hook writes are all id lists by
    // construction (`UseCoexistSelectionOptions.names`).
    (name: FieldPath<TValues>, ids: string[]) =>
      setValue(name, ids as PathValue<TValues, FieldPath<TValues>>),
    [setValue],
  )

  // Unchecking a row drops its coexist opt-in, and turning a row's sync off
  // drops its AI opt-in — so turning either back on starts from a fresh OFF
  // switch. The render already ignores stale ids; these writes are what keep
  // the submitted value in step.
  // Disabled collapses both lists to empty, so a mode the operator switched
  // away from cannot leave an opt-in behind for the fan-out to act on.
  useEffect(() => {
    if (coexistIds.length !== storedCoexistIds.length) {
      write(names.coexistIds, coexistIds)
    }
    if (aiReadsSyncedHistoryIds.length !== storedAiIds.length) {
      write(names.aiReadsSyncedHistoryIds, aiReadsSyncedHistoryIds)
    }
  }, [
    aiReadsSyncedHistoryIds,
    coexistIds,
    names.aiReadsSyncedHistoryIds,
    names.coexistIds,
    storedAiIds,
    storedCoexistIds,
    write,
  ])

  return {
    coexistIds,
    aiReadsSyncedHistoryIds,
    trailingFor: (item) =>
      enabled
        ? coexistRowTrailing({
            aiReadsSyncedHistory: aiReadsSyncedHistoryIds.includes(item.id),
            onAiReadsSyncedHistoryChange: (checked) =>
              write(
                names.aiReadsSyncedHistoryIds,
                toggleCoexistId(aiReadsSyncedHistoryIds, item.id, checked),
              ),
            onSyncChange: (checked) =>
              write(
                names.coexistIds,
                toggleCoexistId(coexistIds, item.id, checked),
              ),
            row: item,
            syncDisabled: !selectedIds.includes(item.id),
            syncing: coexistIds.includes(item.id),
          })
        : null,
    panel: (descriptionKey) =>
      enabled && coexistIds.length > 0 ? (
        <CoexistOptionsPanel descriptionKey={descriptionKey} />
      ) : null,
  }
}
