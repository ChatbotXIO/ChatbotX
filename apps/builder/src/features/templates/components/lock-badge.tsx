"use client"

import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useQueries } from "@tanstack/react-query"
import { LockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { createContext, type ReactNode, useContext } from "react"
import { orpc } from "@/lib/orpc/query"

const NO_LOCKS: ReadonlySet<string> = new Set()
const LockedIdsContext = createContext<ReadonlySet<string>>(NO_LOCKS)

/** `listLockedIdsAPI` accepts at most this many ids per request. */
const LOCKED_IDS_CHUNK_SIZE = 200

type LockedIdsProviderProps = {
  workspaceId: string
  resourceKind: TemplateResourceKind
  /** The ids on the current list page. */
  resourceIds: readonly string[]
  children: ReactNode
}

function combineLockedIds(
  results: ReadonlyArray<{ data?: { lockedIds: string[] } }>,
): ReadonlySet<string> {
  const union = new Set<string>()
  for (const result of results) {
    for (const id of result.data?.lockedIds ?? []) {
      union.add(id)
    }
  }
  return union.size > 0 ? union : NO_LOCKS
}

function chunkIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += LOCKED_IDS_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + LOCKED_IDS_CHUNK_SIZE))
  }
  return chunks
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
  const lockedIds = useQueries({
    queries: chunkIds(resourceIds).map((chunk) => ({
      ...orpc.templatesAPI.listLockedIdsAPI.queryOptions({
        input: { workspaceId, resourceKind, resourceIds: chunk },
      }),
      retry: false,
    })),
    combine: combineLockedIds,
  })
  return (
    <LockedIdsContext.Provider value={lockedIds}>
      {children}
    </LockedIdsContext.Provider>
  )
}

const LockedEditorContext = createContext(false)

/**
 * Marks an editor page as opened from a View-only template. Provided by the
 * server `LockedEditorGuard`; forms read it through `LockedContent`.
 */
export function LockedEditorProvider({
  locked,
  children,
}: {
  locked: boolean
  children: ReactNode
}) {
  return (
    <LockedEditorContext.Provider value={locked}>
      {children}
    </LockedEditorContext.Provider>
  )
}

/** Whether the surrounding editor page is a locked template install. */
export function useIsEditorLocked(): boolean {
  return useContext(LockedEditorContext)
}

/**
 * Wraps ONLY the controls of a resource's content keys
 * (`TEMPLATE_LOCKED_CONTENT_KEYS`). Installer-owned controls (toggles, folder,
 * bindings) and Save stay outside it and stay enabled.
 */
export function LockedContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const isLocked = useIsEditorLocked()
  return (
    <fieldset
      className={`m-0 min-w-0 border-0 p-0 ${className ?? ""}`.trim()}
      data-testid={isLocked ? "template-locked-editor" : undefined}
      disabled={isLocked}
    >
      {children}
    </fieldset>
  )
}

/**
 * Whether a row came from a View-only template: from the list page's fetched
 * set, or, inside a locked editor page, from the page-level flag.
 */
export function useIsLocked(resourceId: string | null | undefined): boolean {
  const lockedIds = useContext(LockedIdsContext)
  const editorLocked = useContext(LockedEditorContext)
  if (!resourceId) {
    return false
  }
  return editorLocked || lockedIds.has(resourceId)
}

/** "View only" marker for a row installed from a View-only template. */
export function LockBadge({ resourceId }: { resourceId: string }) {
  const t = useTranslations("templates.locked")
  const lockedIds = useContext(LockedIdsContext)
  if (!lockedIds.has(resourceId)) {
    return null
  }
  return (
    <Badge
      className="ms-2 shrink-0 gap-1"
      title={t("badgeHint")}
      variant="outline"
    >
      <LockIcon aria-hidden="true" className="size-3" />
      {t("badge")}
    </Badge>
  )
}
