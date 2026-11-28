import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query"
import { contactTagsQueryOptions } from "@/features/contacts/lib/contact-tags-query"
import type { ListContactTagsResponse } from "@/features/contacts/schema/contact-tag"
import type { GetContactResponse } from "@/features/contacts/schema/query"
import type { ListTagOptionsResponse } from "@/features/tags/schema/query"
import type { TagResource } from "@/features/tags/schema/resource"
import { orpc } from "@/lib/orpc/query"
import {
  isTagToggleSettledAfter,
  pendingTagToggleIntents,
  type TagToggleIntent,
  tagToggleQueueKey,
} from "./tag-toggle-queue"

/** Prefix of every composer-grid options query of one contact (any search text). */
export const composerTagOptionsKey = (
  workspaceId: string,
  contactId: string,
): QueryKey =>
  orpc.tagsAPI.privateListWorkspaceTagOptionsAPI.key({
    type: "infinite",
    input: { workspaceId, contactId },
  })

const contactQueryKey = (input: {
  workspaceId: string
  contactId: string
}): QueryKey =>
  orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
    input: { workspaceId: input.workspaceId, contactId: input.contactId },
  }).queryKey

/** A tag query that is fetching right now. */
export type FetchingTagQuery = {
  queryKey: QueryKey
  /**
   * Set while the query is on its first load (no data yet): invalidating it
   * joins the running fetch instead of starting a new one, so the answer may
   * predate the change. Settles when that fetch does.
   */
  firstLoad: Promise<unknown> | undefined
}

/**
 * The contact's tag queries (grid options of any search, the Tags editor's
 * list, the contact itself) that are fetching right now. A read that began
 * before a patch may carry the state from before it.
 */
export const fetchingTagQueries = (
  queryClient: QueryClient,
  input: { workspaceId: string; contactId: string },
): FetchingTagQuery[] => {
  const cache = queryClient.getQueryCache()
  return [
    composerTagOptionsKey(input.workspaceId, input.contactId),
    contactTagsQueryOptions({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
    }).queryKey,
    contactQueryKey(input),
  ].flatMap((queryKey) =>
    cache
      .findAll({ queryKey })
      .filter((query) => query.state.fetchStatus === "fetching")
      .map((query) => ({
        queryKey: query.queryKey,
        firstLoad: query.state.data === undefined ? query.promise : undefined,
      })),
  )
}

/**
 * Re-reads, once its current fetch has settled, every query that was on its
 * first load: invalidating it meanwhile only joined that fetch. Resolves when
 * those follow-up reads are done (a failed first load is not retried here).
 */
export const refetchAfterFirstLoads = async (
  queryClient: QueryClient,
  fetching: readonly FetchingTagQuery[],
): Promise<void> => {
  await Promise.all(
    fetching.map(({ queryKey, firstLoad }) =>
      firstLoad?.then(
        () =>
          queryClient.invalidateQueries({
            queryKey,
            exact: true,
            refetchType: "all",
          }),
        () => undefined,
      ),
    ),
  )
}

/** Sets `applied` on one tag in every cached options page of the contact. */
export const patchTagOptionsApplied = (
  queryClient: QueryClient,
  input: {
    workspaceId: string
    contactId: string
    tagId: string
    applied: boolean
  },
): void => {
  queryClient.setQueriesData<InfiniteData<ListTagOptionsResponse>>(
    { queryKey: composerTagOptionsKey(input.workspaceId, input.contactId) },
    (previous) =>
      previous && {
        ...previous,
        pages: previous.pages.map((page) => ({
          ...page,
          data: page.data.map((option) =>
            option.id === input.tagId
              ? { ...option, applied: input.applied }
              : option,
          ),
        })),
      },
  )
}

/** Ids of every tag in every cached options page of the contact (all searches). */
export const loadedTagOptionIds = (
  queryClient: QueryClient,
  input: { workspaceId: string; contactId: string },
): string[] => {
  const ids = new Set<string>()
  for (const [, data] of queryClient.getQueriesData<
    InfiniteData<ListTagOptionsResponse>
  >({ queryKey: composerTagOptionsKey(input.workspaceId, input.contactId) })) {
    for (const page of data?.pages ?? []) {
      for (const option of page.data) {
        ids.add(option.id)
      }
    }
  }
  return [...ids]
}

/**
 * Sets `applied` in place on every cached option whose id was asked about
 * (`checkedTagIds`) from the server's answer. A tag the answer cannot be
 * trusted for is left alone and returned: one with an unsettled toggle of this
 * agent (its click decides, not the echo), or one that settled after the
 * check began (`requestSequence`, from `currentTagToggleSettleSequence`), whose
 * answer may predate the click. The caller checks the returned tags again once
 * they are idle.
 */
export const patchTagOptionsAppliedFromServer = (
  queryClient: QueryClient,
  input: {
    workspaceId: string
    contactId: string
    checkedTagIds: readonly string[]
    appliedTagIds: readonly string[]
    requestSequence: number
  },
): string[] => {
  const key = tagToggleQueueKey(input.workspaceId, input.contactId)
  const applied = new Set(input.appliedTagIds)
  const inFlight = pendingTagToggleIntents(key)
  const skipped = input.checkedTagIds.filter(
    (tagId) =>
      inFlight.has(tagId) ||
      isTagToggleSettledAfter(key, tagId, input.requestSequence),
  )
  const held = new Set(skipped)
  const checked = new Set(input.checkedTagIds)
  queryClient.setQueriesData<InfiniteData<ListTagOptionsResponse>>(
    { queryKey: composerTagOptionsKey(input.workspaceId, input.contactId) },
    (previous) =>
      previous && {
        ...previous,
        pages: previous.pages.map((page) => ({
          ...page,
          data: page.data.map((option) =>
            checked.has(option.id) && !held.has(option.id)
              ? { ...option, applied: applied.has(option.id) }
              : option,
          ),
        })),
      },
  )
  return skipped
}

/**
 * Adds or removes one tag in the cached contact's `tags` and in the cached
 * contact-tags list of the Tags editor, in place, so neither is re-read (a
 * tag list can be thousands long). Returns whether at least one cache was
 * updated: false when an add has no tag object to insert or neither cache
 * holds data, so the caller can fall back to re-reading.
 */
export const patchContactTags = (
  queryClient: QueryClient,
  input: {
    workspaceId: string
    contactId: string
    tagId: string
    intent: TagToggleIntent
    tag: TagResource | undefined
  },
): boolean => {
  const { tag } = input
  if (input.intent === "add" && !tag) {
    return false
  }
  const withChange = (tags: TagResource[]): TagResource[] => {
    const others = tags.filter((item) => item.id !== input.tagId)
    return input.intent === "add" && tag ? [...others, tag] : others
  }
  let isPatched = false
  const contactKey = contactQueryKey(input)
  queryClient.setQueryData<GetContactResponse>(contactKey, (previous) => {
    if (!previous) {
      return previous
    }
    isPatched = true
    return { ...previous, tags: withChange(previous.tags) }
  })
  queryClient.setQueryData<ListContactTagsResponse>(
    contactTagsQueryOptions({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
    }).queryKey,
    (previous) => {
      if (!previous) {
        return previous
      }
      isPatched = true
      return { data: withChange(previous.data) }
    },
  )
  return isPatched
}
