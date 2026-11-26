"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  Control,
  FieldPath,
  FieldValues,
  PathValue,
  UseFormSetValue,
} from "react-hook-form"
import { useWatch } from "react-hook-form"
import { AhachatImportDialog } from "../components/ahachat-import-dialog"
import {
  AhachatImportNote,
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
  /** Present only for a picker that can offer the AhaChat import-first choice. */
  ahachatIds?: FieldPath<TValues>
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
  /**
   * Rows whose history sync, once turned on, also asks "use data from
   * AhaChat?": the pages AhaChat has, when the member may use the sync and the
   * channel supports it. Needs `names.ahachatIds`; empty, the list stays empty.
   */
  ahachatPageIds?: ReadonlySet<string>
  /**
   * The selection's cap. Turning a row's history sync on selects the row too;
   * once this many rows are selected, an unselected row's switch is disabled.
   * No cap when omitted.
   */
  maxSelected?: number
}

export type CoexistSelectionApi = {
  /** Always a subset of the current selection — safe to submit as-is. */
  coexistIds: string[]
  /** Always a subset of `coexistIds`. */
  aiReadsSyncedHistoryIds: string[]
  /** Always a subset of `coexistIds`: the rows that import from AhaChat first. */
  ahachatIds: string[]
  /** The import-first question while one is open, or `null`. */
  importDialog: ReactNode
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
  ahachatPageIds,
  maxSelected,
}: UseCoexistSelectionOptions<TValues>): CoexistSelectionApi {
  const selectedIds = useWatchedIds(control, names.selectedIds)
  const storedCoexistIds = useWatchedIds(control, names.coexistIds)
  const storedAiIds = useWatchedIds(control, names.aiReadsSyncedHistoryIds)
  const storedAhachatIds = useWatchedIds(
    control,
    names.ahachatIds ?? names.selectedIds,
  )
  const ahachatOn =
    enabled &&
    ahachatPageIds !== undefined &&
    ahachatPageIds.size > 0 &&
    names.ahachatIds !== undefined
  // The row whose "import from AhaChat first?" question is open.
  const [pendingRow, setPendingRow] = useState<{
    id: string
    name: string
  } | null>(null)

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
  // Import-first is a refinement of the history sync: a row that stops syncing
  // stops importing, so it starts from a fresh question when turned back on.
  const ahachatIds = useMemo(
    () =>
      ahachatOn
        ? dropUnselectedCoexistIds(storedAhachatIds, coexistIds)
        : NO_IDS,
    [ahachatOn, storedAhachatIds, coexistIds],
  )

  const write = useCallback(
    // Unavoidable: `setValue` is typed per field path, and `TValues` is only
    // known to the caller — no narrowing can prove a generic path holds
    // `string[]`. The three names this hook writes are all id lists by
    // construction (`UseCoexistSelectionOptions.names`).
    (name: FieldPath<TValues>, ids: string[], validate = false) =>
      setValue(name, ids as PathValue<TValues, FieldPath<TValues>>, {
        shouldValidate: validate,
      }),
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
    if (names.ahachatIds && ahachatIds.length !== storedAhachatIds.length) {
      write(names.ahachatIds, ahachatIds)
    }
  }, [
    ahachatIds,
    aiReadsSyncedHistoryIds,
    coexistIds,
    names.ahachatIds,
    names.aiReadsSyncedHistoryIds,
    names.coexistIds,
    storedAhachatIds,
    storedAiIds,
    storedCoexistIds,
    write,
  ])

  const selectionFull =
    maxSelected !== undefined && selectedIds.length >= maxSelected
  const setSync = (row: { id: string; name: string }, checked: boolean) => {
    // Turning the sync on for a row not selected yet selects it as well, so
    // the operator does not have to tick the row first.
    if (checked && !selectedIds.includes(row.id)) {
      if (selectionFull) {
        return
      }
      write(names.selectedIds, [...selectedIds, row.id], true)
    }
    write(names.coexistIds, toggleCoexistId(coexistIds, row.id, checked))
    // Turning the history sync ON is when the import-first question is asked.
    if (checked && ahachatOn && ahachatPageIds?.has(row.id)) {
      setPendingRow(row)
    }
  }
  const answerImportFirst = (row: { id: string }, importFirst: boolean) => {
    if (names.ahachatIds) {
      write(names.ahachatIds, toggleCoexistId(ahachatIds, row.id, importFirst))
    }
    setPendingRow(null)
  }

  return {
    coexistIds,
    aiReadsSyncedHistoryIds,
    ahachatIds,
    importDialog: pendingRow ? (
      <AhachatImportDialog
        key={pendingRow.id}
        onHistoryOnly={() => answerImportFirst(pendingRow, false)}
        onImportFirst={() => answerImportFirst(pendingRow, true)}
        rowName={pendingRow.name}
      />
    ) : null,
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
              setSync({ id: item.id, name: item.name }, checked),
            row: item,
            syncDisabled: selectionFull && !selectedIds.includes(item.id),
            syncing: coexistIds.includes(item.id),
          })
        : null,
    panel: (descriptionKey) => (
      <>
        {enabled && coexistIds.length > 0 && (
          <CoexistOptionsPanel descriptionKey={descriptionKey} />
        )}
        {ahachatIds.length > 0 && <AhachatImportNote />}
      </>
    ),
  }
}
