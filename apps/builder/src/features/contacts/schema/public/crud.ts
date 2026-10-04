import { z } from "zod"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import { listContactsRequest } from "../query"

const contactIncludeOptions = z.enum([
  "tags",
  "customFields",
  "inboxes",
  "conversation",
])

const includeDescription =
  'Relations to embed in each contact. Omit to include everything (default); pass an empty selection or a narrower list — e.g. `["tags"]` — to shrink the response when scanning many contacts.'

// The shared `contactFilter` preprocess (UI URL state) swallows an invalid
// filter and lists everything. A token caller must instead be told the filter
// is wrong, so the public schemas keep a malformed JSON string as-is and let
// the criteria schema reject it (422 `invalidRequestData`).
const parseStrictContactFilter = (value: unknown) => {
  if (typeof value !== "string") {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const strictContactFilter = z.preprocess(
  parseStrictContactFilter,
  contactFilterCriteriaSchema
    .optional()
    .describe(
      "Structured filter for advanced matching beyond `keyword`. See `contacts.listFilterFields` for the field/operator reference. An invalid filter is rejected (422) rather than ignored.",
    ),
)

export const listContactsPublicRequest = listContactsRequest
  .omit({ workspaceId: true })
  .extend({
    contactFilter: strictContactFilter,
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

export const countContactsPublicRequest = listContactsRequest
  .omit({ workspaceId: true })
  .extend({ contactFilter: strictContactFilter })
export type CountContactsPublicRequest = z.infer<
  typeof countContactsPublicRequest
>

export const countContactsPublicResponse = z.object({
  total: z.number().describe("Number of contacts matching the filter."),
})

export const importContactsPublicResponse = z.object({
  importId: z
    .string()
    .describe(
      "Id of the background import job. The import runs asynchronously; imported contacts appear in `contacts.list` once it finishes.",
    ),
})
export type ImportContactsPublicResponse = z.infer<
  typeof importContactsPublicResponse
>
