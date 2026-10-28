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

/** A `{flowId}:{nodeId}` reference ("Executed Step"): two bigint ids. */
export const isFilterValueNodeReference = (value: string): boolean => {
  const parts = value.split(":")
  return (
    parts.length === 2 &&
    parts.every((part) => part !== undefined && isFilterValueId(part))
  )
}

const filterValueNodeReferencesSchema = z
  .array(z.string().refine(isFilterValueNodeReference, "Invalid reference"))
  .max(MAX_FILTER_VALUE_LABEL_IDS)
  .optional()

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
  flows: filterValueIdsSchema,
  flowNodes: filterValueNodeReferencesSchema,
  keywords: filterValueIdsSchema,
  whatsappFlows: filterValueIdsSchema,
  emailTopics: filterValueIdsSchema,
  pipelines: filterValueIdsSchema,
  pipelineStages: filterValueIdsSchema,
  ads: filterValueIdsSchema,
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
  flows: z.array(filterValueLabelSchema),
  flowNodes: z.array(filterValueLabelSchema),
  keywords: z.array(filterValueLabelSchema),
  whatsappFlows: z.array(filterValueLabelSchema),
  emailTopics: z.array(filterValueLabelSchema),
  pipelines: z.array(filterValueLabelSchema),
  pipelineStages: z.array(filterValueLabelSchema),
  ads: z.array(filterValueLabelSchema),
})

export type ResolveFilterValueLabelsResponse = z.infer<
  typeof resolveFilterValueLabelsResponse
>

/**
 * Public twin, limited to `tags`: the one referenced type a `contacts`-scoped
 * token can already list. Sequences, broadcasts, ref links, inboxes, members
 * and teams belong to other scopes (or are people names), so their names stay
 * behind those scopes' own list routes.
 */
export const resolveFilterValueLabelsPublicRequest = z.object({
  tags: filterValueIdsSchema.describe("Tag ids from a `tag` condition."),
})

export const resolveFilterValueLabelsPublicResponse = z.object({
  tags: resolveFilterValueLabelsResponse.shape.tags,
})
