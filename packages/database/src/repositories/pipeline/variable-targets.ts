import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type AnyColumn,
  and,
  db,
  eq,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  inboxTeamModel,
  pipelineItemAssigneeModel,
  pipelineItemModel,
  pipelineModel,
  pipelineStageModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { PgTable } from "drizzle-orm/pg-core"

/** `"Table"."column"`: drizzle drops the table prefix when a query selects from one source, which makes the joined subselect ambiguous. */
const qualified = (table: PgTable, column: AnyColumn) =>
  sql`${table}.${sql.identifier(column.name)}`

/** Display names of an item's assignees (admins, then teams), oldest first. */
const assigneeNames = (itemId: SQL, workspaceId: string) => {
  const assignee = pipelineItemAssigneeModel
  return sql<Array<string | null> | null>`(
    select array_agg(
      coalesce(${qualified(userModel, userModel.name)}, ${qualified(inboxTeamModel, inboxTeamModel.name)})
      order by ${qualified(assignee, assignee.createdAt)}, ${qualified(assignee, assignee.id)}
    )
    from ${assignee}
    left join ${workspaceMemberModel}
      on ${qualified(workspaceMemberModel, workspaceMemberModel.id)} = ${qualified(assignee, assignee.workspaceMemberId)}
    left join ${userModel}
      on ${qualified(userModel, userModel.id)} = ${qualified(workspaceMemberModel, workspaceMemberModel.userId)}
    left join ${inboxTeamModel}
      on ${qualified(inboxTeamModel, inboxTeamModel.id)} = ${qualified(assignee, assignee.inboxTeamId)}
    where ${qualified(assignee, assignee.itemId)} = ${itemId}
      and ${qualified(assignee, assignee.workspaceId)} = ${workspaceId}
  )`
}

export const pipelineVariableTargetRepository = {
  /**
   * One row per pipeline the contact has items in: its most recently created
   * open item, else its most recently created item. Item, pipeline, stage,
   * assignee names and the workspace target country (which a pipeline without
   * a currency follows) come back in this single query.
   */
  async listForContact(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    // Pick the winning item per pipeline first; the correlated assignee
    // subselect then runs once per winner, not once per candidate item.
    const winners = tx
      .selectDistinctOn([pipelineItemModel.pipelineId], {
        itemId: sql<string>`${pipelineItemModel.id}`.as("item_id"),
        title: pipelineItemModel.title,
        value: pipelineItemModel.value,
        status: pipelineItemModel.status,
        priority: pipelineItemModel.priority,
        dueDate: pipelineItemModel.dueDate,
        createdAt: pipelineItemModel.createdAt,
        updatedAt: pipelineItemModel.updatedAt,
        pipelineId: pipelineItemModel.pipelineId,
        referenceName: pipelineModel.referenceName,
        currency: pipelineModel.currency,
        settings: pipelineModel.settings,
        stageName: pipelineStageModel.name,
        targetCountry: workspaceModel.targetCountry,
      })
      .from(pipelineItemModel)
      .innerJoin(
        pipelineModel,
        and(
          eq(pipelineModel.id, pipelineItemModel.pipelineId),
          eq(pipelineModel.workspaceId, pipelineItemModel.workspaceId),
        ),
      )
      .innerJoin(
        pipelineStageModel,
        eq(pipelineStageModel.id, pipelineItemModel.stageId),
      )
      .innerJoin(
        workspaceModel,
        eq(workspaceModel.id, pipelineItemModel.workspaceId),
      )
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.contactId, input.contactId),
        ),
      )
      .orderBy(
        pipelineItemModel.pipelineId,
        sql`(${pipelineItemModel.status} = 'open') desc`,
        sql`${pipelineItemModel.createdAt} desc`,
        sql`${pipelineItemModel.id} desc`,
      )
      .as("winners")
    return await tx
      .select({
        itemId: winners.itemId,
        title: winners.title,
        value: winners.value,
        status: winners.status,
        priority: winners.priority,
        dueDate: winners.dueDate,
        createdAt: winners.createdAt,
        updatedAt: winners.updatedAt,
        pipelineId: winners.pipelineId,
        referenceName: winners.referenceName,
        currency: winners.currency,
        settings: winners.settings,
        stageName: winners.stageName,
        targetCountry: winners.targetCountry,
        assignees: assigneeNames(
          sql`${sql.identifier("winners")}.${sql.identifier("item_id")}`,
          input.workspaceId,
        ),
      })
      .from(winners)
      .orderBy(winners.pipelineId)
  },

  /**
   * `{{last_opportunity_id}}`: the contact's most recently created or updated
   * item in any pipeline. Served by the contactId index (few rows per contact).
   */
  async findLastTouchedItemId(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ id: pipelineItemModel.id })
      .from(pipelineItemModel)
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.contactId, input.contactId),
        ),
      )
      .orderBy(
        sql`${pipelineItemModel.updatedAt} desc`,
        sql`${pipelineItemModel.id} desc`,
      )
      .limit(1)
    return row?.id ?? null
  },
}
