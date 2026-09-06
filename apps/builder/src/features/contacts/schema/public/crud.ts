import { z } from "zod"
import { listContactsRequest } from "../query"

export const contactIncludeOptions = z.enum([
  "tags",
  "customFields",
  "inboxes",
  "conversation",
])
export type ContactIncludeOption = z.infer<typeof contactIncludeOptions>

const includeDescription =
  'Relations to embed in each contact. Omit to include everything (default); pass an empty selection or a narrower list — e.g. `["tags"]` — to shrink the response when scanning many contacts.'

export const listContactsPublicRequest = listContactsRequest
  .omit({ workspaceId: true })
  .extend({
    include: z
      .array(contactIncludeOptions)
      .optional()
      .describe(includeDescription),
    withCount: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Whether to compute totalCount/pageCount. Set to false to skip the count query when you only need the rows — faster on large workspaces.",
      ),
  })
export type ListContactsPublicRequest = z.infer<
  typeof listContactsPublicRequest
>

export const countContactsPublicRequest = listContactsRequest.omit({
  workspaceId: true,
})
export type CountContactsPublicRequest = z.infer<
  typeof countContactsPublicRequest
>

export const countContactsPublicResponse = z.object({ total: z.number() })
