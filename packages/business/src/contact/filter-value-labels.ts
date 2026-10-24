import type { ContactActivityValueSource } from "@chatbotx.io/database/partials"
import { automatedResponseService } from "../automated-response/service"
import { broadcastService } from "../broadcast/service"
import { emailTopicService } from "../email-topic/service"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { flowService } from "../flow/service"
import { inboxService } from "../inbox/service"
import { reflinkService } from "../reflink/service"
import type { IdLabel } from "../select-labels-by-ids"
import { sequenceService } from "../sequence/service"
import { tagService } from "../tag/service"
import { whatsappFlowService } from "../whatsapp-flow/service"
import { workspaceMemberService } from "../workspace-member/service"

export type FilterValueLabelTypes = {
  tags: string[]
  sequences: string[]
  broadcasts: string[]
  reflinks: string[]
  inboxes: string[]
  /** User ids (not the `u_` prefixed filter values). */
  members: string[]
  /** Team ids (not the `t_` prefixed filter values). */
  inboxTeams: string[]
  flows: string[]
  /** `{flowId}:{nodeId}` references, the "Executed Step" filter value. */
  flowNodes: string[]
  /** Contact keyword rule ids; the label is the rule's keywords. */
  keywords: string[]
  whatsappFlows: string[]
  emailTopics: string[]
}

export type FilterValueLabels = Record<keyof FilterValueLabelTypes, IdLabel[]>

type LabelResolver = (input: {
  workspaceId: string
  ids: string[]
}) => Promise<IdLabel[]>

// One resolver per filter value type. Each is a primary-key lookup scoped to
// the workspace, so cost depends on the number of ids asked for, never on how
// many rows the workspace has.
const labelResolvers: Record<keyof FilterValueLabelTypes, LabelResolver> = {
  tags: async ({ workspaceId, ids }) =>
    (await tagService.findManyByIds({ workspaceId, ids })).map((tag) => ({
      id: tag.id,
      name: tag.name,
    })),
  sequences: (input) => sequenceService.listLabelsByIds(input),
  broadcasts: (input) => broadcastService.listLabelsByIds(input),
  reflinks: (input) => reflinkService.listLabelsByIds(input),
  inboxes: (input) => inboxService.listLabelsByIds(input),
  members: ({ workspaceId, ids }) =>
    workspaceMemberService.listLabelsByUserIds({ workspaceId, userIds: ids }),
  inboxTeams: (input) => inboxTeamService.listLabelsByIds(input),
  flows: (input) => flowService.listLabelsByIds(input),
  flowNodes: (input) => flowService.listNodeLabelsByIds(input),
  keywords: (input) => automatedResponseService.listKeywordLabelsByIds(input),
  whatsappFlows: (input) => whatsappFlowService.listLabelsByIds(input),
  emailTopics: (input) => emailTopicService.listLabelsByIds(input),
}

const labelTypes = Object.keys(
  labelResolvers,
) as (keyof FilterValueLabelTypes)[]

/**
 * Display names for the ids a contact filter references. An id missing from
 * the result no longer exists (deleted, or no longer in this workspace).
 */
export const resolveContactFilterValueLabels = async (input: {
  workspaceId: string
  ids: Partial<FilterValueLabelTypes>
}): Promise<FilterValueLabels> => {
  const resolved = await Promise.all(
    labelTypes.map(
      async (type) =>
        [
          type,
          await labelResolvers[type]({
            workspaceId: input.workspaceId,
            ids: [...new Set(input.ids[type] ?? [])],
          }),
        ] as const,
    ),
  )
  return Object.fromEntries(resolved) as FilterValueLabels
}

export type ContactActivityValueOption = { value: string; label: string }

/** Rows a picker shows per search; narrowing the search finds the rest. */
const ACTIVITY_VALUE_OPTIONS_LIMIT = 50

type ActivityValueOptionLoader = (input: {
  workspaceId: string
  search: string
}) => Promise<ContactActivityValueOption[]>

// One loader per searchable activity value source, each reusing the service
// that already lists that entity (so pickers and the public list routes agree).
const activityValueOptionLoaders: Record<
  ContactActivityValueSource,
  ActivityValueOptionLoader
> = {
  keywords: async ({ workspaceId, search }) =>
    (
      await automatedResponseService.listKeywordOptions({
        workspaceId,
        search,
        limit: ACTIVITY_VALUE_OPTIONS_LIMIT,
      })
    ).map((rule) => ({ value: rule.id, label: rule.keywords.join(", ") })),
  whatsappFlows: async ({ workspaceId, search }) =>
    (
      await whatsappFlowService.list({
        where: { workspaceId, name: search || undefined },
        limit: ACTIVITY_VALUE_OPTIONS_LIMIT,
      })
    ).map((flow) => ({ value: flow.id, label: flow.name })),
  emailTopics: async ({ workspaceId, search }) => {
    const { data } = await emailTopicService.list({
      workspaceId,
      name: search || null,
      page: 1,
      perPage: ACTIVITY_VALUE_OPTIONS_LIMIT,
    })
    return data.map((topic) => ({ value: topic.id, label: topic.name }))
  },
}

/**
 * Searchable values for the activity-backed contact filters whose entity has
 * no cheap full list (keyword rules, WhatsApp Flows, email topics). Bounded to
 * one page; selected values are named separately by id (`labelResolvers`).
 */
export const listContactActivityValueOptions = async (input: {
  workspaceId: string
  source: ContactActivityValueSource
  search?: string
}): Promise<ContactActivityValueOption[]> =>
  await activityValueOptionLoaders[input.source]({
    workspaceId: input.workspaceId,
    search: input.search?.trim() ?? "",
  })
