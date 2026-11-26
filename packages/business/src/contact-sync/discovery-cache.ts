import type { ContactSyncProvider } from "@chatbotx.io/database/partials"
import type { ContactSyncDiscoveryEntry } from "./types"

/**
 * A short, bounded memory of what the source said about a workspace's pages,
 * so a user browsing the picker, the schema and the mappings does not spend the
 * source's per-workspace discovery limit. It holds existence, a name and an
 * avatar only (never contact data), per process (no shared state to keep
 * consistent), and is bounded twice: entries per workspace and workspaces.
 * An answer of `unavailable` is never remembered: a retry must ask again.
 */
export const DISCOVERY_CACHE_TTL_MS = 60_000
/** Room for a connect picker's pages next to the workspace's connected ones. */
export const DISCOVERY_CACHE_MAX_ENTRIES_PER_WORKSPACE = 200
const DISCOVERY_CACHE_MAX_WORKSPACES = 500

type WorkspaceEntries = Map<
  string,
  { entry: ContactSyncDiscoveryEntry; expiresAt: number }
>

const workspaces = new Map<string, WorkspaceEntries>()

const scopeKey = (provider: ContactSyncProvider, workspaceId: string) =>
  `${provider}:${workspaceId}`

/** The remembered answer of a page, or `undefined` once it expired or was never kept. */
export const readDiscoveryCache = (
  input: { provider: ContactSyncProvider; workspaceId: string },
  pageKey: string,
  now = Date.now(),
): ContactSyncDiscoveryEntry | undefined => {
  const kept = workspaces
    .get(scopeKey(input.provider, input.workspaceId))
    ?.get(pageKey)
  return kept && kept.expiresAt > now ? kept.entry : undefined
}

export const writeDiscoveryCache = (
  input: { provider: ContactSyncProvider; workspaceId: string },
  pageKey: string,
  entry: ContactSyncDiscoveryEntry,
  now = Date.now(),
): void => {
  if (entry.status === "unavailable") {
    return
  }
  const key = scopeKey(input.provider, input.workspaceId)
  let entries = workspaces.get(key)
  if (!entries) {
    if (workspaces.size >= DISCOVERY_CACHE_MAX_WORKSPACES) {
      // The oldest workspace goes first (Map keeps insertion order).
      const oldest = workspaces.keys().next().value
      if (oldest !== undefined) {
        workspaces.delete(oldest)
      }
    }
    entries = new Map()
    workspaces.set(key, entries)
  }
  if (
    !entries.has(pageKey) &&
    entries.size >= DISCOVERY_CACHE_MAX_ENTRIES_PER_WORKSPACE
  ) {
    const oldest = entries.keys().next().value
    if (oldest !== undefined) {
      entries.delete(oldest)
    }
  }
  entries.set(pageKey, { entry, expiresAt: now + DISCOVERY_CACHE_TTL_MS })
}

/** Forgets everything (tests). */
export const clearDiscoveryCache = (): void => {
  workspaces.clear()
}
