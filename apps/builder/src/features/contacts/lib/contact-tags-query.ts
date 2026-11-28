import { orpc } from "@/lib/orpc/query"

type ContactTagsQueryInput = { workspaceId: string; contactId: string }

/**
 * The contact's own tag list (the inbox panel's Tags editor). Separate from
 * `getContact`, whose tag list is never refetched on a tag event, so the
 * editor can be refreshed alone and only while it is open.
 */
export const contactTagsQueryOptions = (input: ContactTagsQueryInput) =>
  orpc.contactsAPIs.listContactTagsAuthenticatedAPI.queryOptions({ input })
