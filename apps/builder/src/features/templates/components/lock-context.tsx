"use client"

import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { useQueries } from "@tanstack/react-query"
import { createContext, type ReactNode, useContext } from "react"
import { orpc } from "@/lib/orpc/query"
import { useEditorLockState } from "./locked-editor"

const NO_LOCKS: ReadonlySet<string> = new Set()
/** `null` = no `LockedIdsProvider` above: the page forgot to wire the lock lookup. */
const LockedIdsContext = createContext<ReadonlySet<string> | null>(null)
const UndeletableIdsContext = createContext<ReadonlySet<string> | null>(null)

const LOCKED_IDS_CHUNK_SIZE = 200

type LockedIdsPage = { lockedIds: string[]; undeletableIds: string[] }

const warnedHooks = new Set<string>()

/**
 * Without a provider the lookup silently answers "not locked", which would let
 * a View-only row be edited in the UI. Flag it while developing; production
 * keeps the quiet fallback because the write paths refuse locked edits anyway.
 */
const warnMissingProvider = (hook: string) => {
  if (process.env.NODE_ENV === "production" || warnedHooks.has(hook)) {
    return
  }
  warnedHooks.add(hook)
  console.warn(
    `[templates] ${hook}() was called without a LockedIdsProvider / TemplateLockedList above it, so no row can show as View-only.`,
  )
}

const unionOf = (
  results: ReadonlyArray<{ data?: LockedIdsPage }>,
  pick: (page: LockedIdsPage) => string[],
): ReadonlySet<string> => {
  const union = new Set<string>()
  for (const result of results) {
    for (const id of result.data ? pick(result.data) : []) {
      union.add(id)
    }
  }
  return union.size > 0 ? union : NO_LOCKS
}

function combineLockedIds(results: ReadonlyArray<{ data?: LockedIdsPage }>): {
  locked: ReadonlySet<string>
  undeletable: ReadonlySet<string>
} {
  return {
    locked: unionOf(results, (page) => page.lockedIds),
    undeletable: unionOf(results, (page) => page.undeletableIds),
  }
}

function chunkIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += LOCKED_IDS_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + LOCKED_IDS_CHUNK_SIZE))
  }
  return chunks
}

type LockedIdsProviderProps = {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceIds: readonly string[]
  children: ReactNode
}

/**
 * Fetches, with one request per 200 ids (one for a normal list page), which of
 * its rows came from a View-only template, and shares the answer with every
 * `LockBadge` underneath. A failed lookup shows no badges: the write paths
 * refuse locked edits on their own, so the badge is only a courtesy.
 */
export function LockedIdsProvider({
  workspaceId,
  resourceKind,
  resourceIds,
  children,
}: LockedIdsProviderProps) {
  const { locked, undeletable } = useQueries({
    queries: chunkIds(resourceIds).map((chunk) => ({
      ...orpc.templatesAPI.listLockedIdsAPI.queryOptions({
        input: { workspaceId, resourceKind, resourceIds: chunk },
      }),
      retry: false,
    })),
    combine: combineLockedIds,
  })
  return (
    <LockedIdsContext.Provider value={locked}>
      <UndeletableIdsContext.Provider value={undeletable}>
        {children}
      </UndeletableIdsContext.Provider>
    </LockedIdsContext.Provider>
  )
}

type TemplateLockedListProps = Omit<LockedIdsProviderProps, "resourceIds"> & {
  rows: ReadonlyArray<{ id: string }>
}

export function TemplateLockedList({
  rows,
  ...props
}: TemplateLockedListProps) {
  return (
    <LockedIdsProvider {...props} resourceIds={rows.map((row) => row.id)} />
  )
}

export const useLockedIdSet = (): ReadonlySet<string> | null =>
  useContext(LockedIdsContext)

/**
 * Whether a row came from a View-only template: from the list page's fetched
 * set, or, inside a locked editor page, from the page-level flag.
 */
export function useIsLocked(resourceId: string | null | undefined): boolean {
  const lockedIds = useContext(LockedIdsContext)
  const editorState = useEditorLockState()
  if (!resourceId) {
    return false
  }
  if (lockedIds === null && editorState === null) {
    warnMissingProvider("useIsLocked")
  }
  return editorState === true || (lockedIds?.has(resourceId) ?? false)
}

/**
 * Whether a list row came from a template that does not allow deleting it, so
 * its Delete action is shown disabled. The delete paths refuse it on their own.
 */
export function useIsUndeletable(
  resourceId: string | null | undefined,
): boolean {
  const undeletableIds = useContext(UndeletableIdsContext)
  if (!resourceId) {
    return false
  }
  if (undeletableIds === null) {
    warnMissingProvider("useIsUndeletable")
    return false
  }
  return undeletableIds.has(resourceId)
}

type GuardProps = {
  resourceId: string
  children: (disabled: boolean) => ReactNode
}

/**
 * Hands a row's Delete control whether it must be disabled, so a table cell
 * can disable it without calling a hook itself:
 * `<UndeletableGuard resourceId={id}>{(disabled) => <Item disabled={disabled} />}</UndeletableGuard>`.
 */
export function UndeletableGuard({ resourceId, children }: GuardProps) {
  return <>{children(useIsUndeletable(resourceId))}</>
}

/**
 * Render-prop twin of `UndeletableGuard` for rename and duplicate: a View-only
 * copy can not be renamed, and duplicating it would hand out an editable clone
 * of content the publisher locked.
 */
export function LockedGuard({ resourceId, children }: GuardProps) {
  return <>{children(useIsLocked(resourceId))}</>
}
