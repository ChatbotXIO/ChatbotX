import { z } from "zod"

/**
 * Ids a single filter can reference per type. Each type is one primary-key
 * `IN` lookup, so this only bounds the work a single request can ask for.
 */
export const MAX_FILTER_VALUE_LABEL_IDS = 500

const MAX_BIGINT_ID = 9_223_372_036_854_775_807n
const BIGINT_ID_PATTERN = /^\d{1,19}$/

/**
 * Entity ids are Postgres bigint columns: anything else (or a number past the
 * bigint range) can never match a row and would fail the whole lookup.
 */
export const isFilterValueId = (id: string): boolean =>
  BIGINT_ID_PATTERN.test(id) &&
  BigInt(id).toString() === id &&
  BigInt(id) <= MAX_BIGINT_ID

const filterValueIdsSchema = z
  .array(z.string().refine(isFilterValueId, "Invalid id"))
  .max(MAX_FILTER_VALUE_LABEL_IDS)
  .optional()

export const resolveFilterValueLabelsRequest = z.object({
  workspaceId: z.string(),
  tags: filterValueIdsSchema,
  sequences: filterValueIdsSchema,
  broadcasts: filterValueIdsSchema,
  reflinks: filterValueIdsSchema,
  inboxes: filterValueIdsSchema,
  members: filterValueIdsSchema,
  inboxTeams: filterValueIdsSchema,
})

const filterValueLabelSchema = z.object({ id: z.string(), name: z.string() })

export const resolveFilterValueLabelsResponse = z.object({
  tags: z.array(filterValueLabelSchema),
  sequences: z.array(filterValueLabelSchema),
  broadcasts: z.array(filterValueLabelSchema),
  reflinks: z.array(filterValueLabelSchema),
  inboxes: z.array(filterValueLabelSchema),
  members: z.array(filterValueLabelSchema),
  inboxTeams: z.array(filterValueLabelSchema),
})

export type ResolveFilterValueLabelsResponse = z.infer<
  typeof resolveFilterValueLabelsResponse
>

/**
 * Public twin: the same lookup without the people-name types (`members`,
 * `inboxTeams`), which a contacts-scoped token has no other way to read.
 */
export const resolveFilterValueLabelsPublicRequest =
  resolveFilterValueLabelsRequest
    .omit({ workspaceId: true, members: true, inboxTeams: true })
    .extend({
      tags: filterValueIdsSchema.describe("Tag ids from a `tag` condition."),
      sequences: filterValueIdsSchema.describe("Sequence ids."),
      broadcasts: filterValueIdsSchema.describe("Broadcast ids."),
      reflinks: filterValueIdsSchema.describe("Ref link ids."),
      inboxes: filterValueIdsSchema.describe("Inbox (channel) ids."),
    })

export const resolveFilterValueLabelsPublicResponse =
  resolveFilterValueLabelsResponse.omit({ members: true, inboxTeams: true })
