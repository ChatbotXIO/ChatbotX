import { broadcastService } from "../broadcast/service"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { inboxService } from "../inbox/service"
import { reflinkService } from "../reflink/service"
import type { IdLabel } from "../select-labels-by-ids"
import { sequenceService } from "../sequence/service"
import { tagService } from "../tag/service"
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
