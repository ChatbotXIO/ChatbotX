import type {
  ContactSyncActorType,
  ContactSyncSourceChannel,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { ahachatRequest } from "./client"
import {
  AHACHAT_DEFAULT_CONTACTS_PAGE_SIZE,
  AHACHAT_MAX_CONTACTS_PAGE_SIZE,
  AHACHAT_MAX_DISCOVERY_PAGES,
  AHACHAT_MAX_LIST_ITEMS,
} from "./constants"
import { AhachatApiError } from "./error"
import {
  type AhachatContact,
  type AhachatContactsPage,
  type AhachatCustomField,
  type AhachatDiscoveryEntry,
  type AhachatPage,
  type AhachatTag,
  ahachatContactSchema,
  ahachatContactsPageSchema,
  ahachatCustomFieldSchema,
  ahachatDiscoveryEntrySchema,
  ahachatPageSchema,
  ahachatTagSchema,
} from "./schemas"

/** Who the signed request is made for. Never fabricated. */
export type AhachatActor = {
  type: ContactSyncActorType
  id: string
}

/** What every export call carries: the workspace and the actor behind it. */
export type AhachatRequestScope = {
  workspaceId: string
  actor: AhachatActor
}

/** A page as AhaChat knows it: the channel names the id space. */
export type AhachatPageRef = {
  channel: ContactSyncSourceChannel
  id: string
}

const pageScopedBody = (scope: AhachatRequestScope, page: AhachatPageRef) => ({
  workspace_id: scope.workspaceId,
  actor: scope.actor,
  page,
})

/**
 * Which of the pairs exist in AhaChat: found, absent or ambiguous, plus the
 * page's name and avatar. Bounded and discovery-only (no contact data).
 */
export const discoverAhachatPages = async (
  scope: AhachatRequestScope,
  pages: AhachatPageRef[],
): Promise<AhachatDiscoveryEntry[]> => {
  if (pages.length === 0 || pages.length > AHACHAT_MAX_DISCOVERY_PAGES) {
    throw new AhachatApiError({ code: "invalidRequest", statusCode: 422 })
  }
  return await ahachatRequest(
    "pages",
    { workspace_id: scope.workspaceId, actor: scope.actor, pages },
    z.array(ahachatDiscoveryEntrySchema).max(AHACHAT_MAX_DISCOVERY_PAGES),
  )
}

/** The page's details, including the newest contact id (the snapshot bound). */
export const getAhachatPage = (
  scope: AhachatRequestScope,
  page: AhachatPageRef,
): Promise<AhachatPage> =>
  ahachatRequest("page", pageScopedBody(scope, page), ahachatPageSchema)

export const listAhachatTags = (
  scope: AhachatRequestScope,
  page: AhachatPageRef,
): Promise<AhachatTag[]> =>
  ahachatRequest(
    "tags",
    pageScopedBody(scope, page),
    z.array(ahachatTagSchema).max(AHACHAT_MAX_LIST_ITEMS),
  )

export const listAhachatCustomFields = (
  scope: AhachatRequestScope,
  page: AhachatPageRef,
): Promise<AhachatCustomField[]> =>
  ahachatRequest(
    "custom-fields",
    pageScopedBody(scope, page),
    z.array(ahachatCustomFieldSchema).max(AHACHAT_MAX_LIST_ITEMS),
  )

/** `afterId < id <= untilId`; a missing bound does not limit that side. */
const isWithinRange = (
  id: string,
  range: { afterId: string | null; untilId: string | null },
): boolean => {
  const value = BigInt(id)
  if (range.afterId !== null && value <= BigInt(range.afterId)) {
    return false
  }
  return range.untilId === null || value <= BigInt(range.untilId)
}

/**
 * Whether a page keeps the paging contract, so reading stays finite: "more"
 * comes with rows and a next cursor, which moves forward without passing the
 * snapshot bound. Each broken rule could otherwise loop or read past it.
 */
const isPageWithinContract = (
  page: z.infer<typeof ahachatContactsPageSchema>,
  input: { afterId: string | null; untilId: string | null },
  nextCursor: string | null,
): boolean => {
  if (page.has_more && (page.items.length === 0 || nextCursor === null)) {
    return false
  }
  return nextCursor === null || isWithinRange(nextCursor, input)
}

/**
 * One page of contacts with `afterId < id <= untilId`, in id order. A row
 * that does not match the contract is counted in `invalidCount` instead of
 * failing the whole page.
 */
export const listAhachatContacts = async (
  scope: AhachatRequestScope,
  page: AhachatPageRef,
  input: {
    afterId: string | null
    untilId: string | null
    limit?: number
    /** Aborts the request in flight: the caller no longer wants the page. */
    signal?: AbortSignal
  },
): Promise<AhachatContactsPage> => {
  const limit = Math.min(
    input.limit ?? AHACHAT_DEFAULT_CONTACTS_PAGE_SIZE,
    AHACHAT_MAX_CONTACTS_PAGE_SIZE,
  )
  const result = await ahachatRequest(
    "users",
    {
      ...pageScopedBody(scope, page),
      after_id: input.afterId ?? "0",
      until_id: input.untilId,
      limit,
    },
    ahachatContactsPageSchema,
    input.signal,
  )
  const nextCursor = result.next_cursor ?? null
  if (!isPageWithinContract(result, input, nextCursor)) {
    throw new AhachatApiError({ code: "invalidResponse", statusCode: 502 })
  }
  const contacts: AhachatContact[] = []
  let invalidCount = 0
  for (const item of result.items) {
    const parsed = ahachatContactSchema.safeParse(item)
    // A row outside the asked range would read past the snapshot bound or
    // count an already imported contact again.
    if (parsed.success && isWithinRange(parsed.data.id, input)) {
      contacts.push(parsed.data)
    } else {
      invalidCount += 1
    }
  }
  return {
    contacts,
    invalidCount,
    nextCursor,
    hasMore: result.has_more,
  }
}
