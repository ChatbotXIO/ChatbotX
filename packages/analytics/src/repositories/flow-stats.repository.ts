import type { FlowNodeStatsType } from "@chatbotx.io/clickhouse/schemas"
import { and, db, eq, sql } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowNodeStatModel,
} from "@chatbotx.io/database/schema"
import {
  type FlowNode,
  NodeType,
  type SendMessageNodeSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { ContactEventData } from "../schemas/common"
import type {
  FlowNodeEventType,
  FlowNodeStatClickedItem,
  FlowNodeStatFailedItem,
  FlowNodeStatItem,
  FlowNodeStatSeenItem,
  FlowNodeStats,
  FlowNodeStatsResponse,
  FlowNodeStatTimestampField,
  FlowStatsRequest,
  RemoveFlowStatsRequest,
} from "../schemas/flow-stats"
import { BaseRepository } from "./base.repository"

export class FlowStatsRepository extends BaseRepository {
  async insertPgNodeStats(data: FlowNodeStatItem[]): Promise<void> {
    if (data.length === 0) {
      return
    }

    await db.insert(flowNodeStatModel).values(data).onConflictDoNothing()
  }

  async insertClickhouseNodeStats(data: FlowNodeStatsType[]): Promise<void> {
    if (data.length === 0) {
      return
    }
    await this.insert("flow_node_events", data)
  }

  private async upsertRecords(items: FlowNodeStatItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const tuples = items.map(
      (i) => sql`(${i.analyticsId}, ${i.nodeId}, ${i.contactInboxId})`,
    )

    const existing = await db.execute<{
      analyticsId: string
      nodeId: string
      contactInboxId: string
    }>(sql`
      SELECT "analyticsId", "nodeId", "contactInboxId"
      FROM "FlowNodeStat"
      WHERE ("analyticsId", "nodeId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)

    const existingSet = new Set(
      existing.rows.map(
        (r) => `${r.analyticsId}:${r.nodeId}:${r.contactInboxId}`,
      ),
    )

    const newItems = items.filter(
      (i) =>
        !existingSet.has(`${i.analyticsId}:${i.nodeId}:${i.contactInboxId}`),
    )

    if (newItems.length === 0) {
      return
    }

    const values = newItems.map((r) => ({
      id: createId(),
      workspaceId: r.workspaceId,
      flowId: r.flowId,
      analyticsId: r.analyticsId,
      nodeId: r.nodeId,
      contactId: r.contactId,
      contactInboxId: r.contactInboxId,
      eventType: r.eventType,
    }))

    await db.insert(flowNodeStatModel).values(values).onConflictDoNothing()
  }

  async updateTimestamp(
    field: FlowNodeStatTimestampField,
    items: FlowNodeStatItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return
    }

    await this.upsertRecords(items)

    const tuples = items.map(
      (i) => sql`(${i.analyticsId}, ${i.nodeId}, ${i.contactInboxId})`,
    )

    const caseWhen = items.map(
      (item) =>
        sql`WHEN "contactInboxId" = ${item.contactInboxId} THEN greatest(${sql.identifier(field)}, ${item.occurredAt})`,
    )

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET ${sql.identifier(field)} = CASE ${sql.join(caseWhen, sql` `)} ELSE ${sql.identifier(field)} END
      WHERE ("analyticsId", "nodeId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }

  async updateClicked(items: FlowNodeStatClickedItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    await this.upsertRecords(items)

    const tuples = items.map(
      (i) => sql`(${i.analyticsId}, ${i.nodeId}, ${i.contactInboxId})`,
    )

    const clickedCases = items.map(
      (item) =>
        sql`WHEN "analyticsId" = ${item.analyticsId} AND "nodeId" = ${item.nodeId} AND "contactInboxId" = ${item.contactInboxId} THEN ${item.occurredAt}`,
    )

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET "clickedAt" = (CASE ${sql.join(clickedCases, sql` `)} ELSE "clickedAt" END)::text,
          "buttonId" = CASE
            ${sql.join(
              items.map(
                (i) =>
                  sql`WHEN "analyticsId" = ${i.analyticsId} AND "nodeId" = ${i.nodeId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.buttonId}`,
              ),
              sql` `,
            )}
            ELSE "buttonId"
          END
      WHERE ("analyticsId", "nodeId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }

  async updateSeenAt(items: FlowNodeStatSeenItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const seenCases = items.map(
      (item) =>
        sql`WHEN "id" = ${item.id} THEN greatest("seenAt", ${item.seenAt})`,
    )

    const idTuples = items.map((i) => sql`${i.id}`)

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET "seenAt" = CASE ${sql.join(seenCases, sql` `)} ELSE "seenAt" END
      WHERE "id" IN (${sql.join(idTuples, sql`, `)})
    `)
  }

  async updateFailedAt(items: FlowNodeStatFailedItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const failedCases = items.map(
      (item) =>
        sql`WHEN "contactInboxId" = ${item.contactInboxId} THEN greatest("failedAt", ${item.occurredAt})`,
    )

    const errorContentCases = items.map(
      (item) =>
        sql`WHEN "contactInboxId" = ${item.contactInboxId} THEN ${item.errorContent}`,
    )

    const contactInboxIdTuples = items.map((i) => sql`${i.contactInboxId}`)

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET "failedAt" = CASE ${sql.join(failedCases, sql` `)} ELSE "failedAt" END,
          "errorContent" = CASE ${sql.join(errorContentCases, sql` `)} ELSE "errorContent" END
      WHERE "contactInboxId" IN (${sql.join(contactInboxIdTuples, sql`, `)})
    `)
  }

  async getNodeStats(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    nodeId: string
  }): Promise<FlowNodeStats> {
    const nodeStatsSql = `
      SELECT
        event_type,
        sum(total_count) as total
      FROM flow_node_agg
      WHERE workspace_id = {workspaceId:String}
        AND flow_id = {flowId:String}
        AND analytics_id = {analyticsId:String}
        AND node_id = {nodeId:String}
        AND event_type IN ('message:delivered', 'message:failed', 'message:seen')
      GROUP BY event_type
    `

    const uniqueDeliveredSql = `
      SELECT uniqMerge(uniq_contact) AS unique_delivered
      FROM flow_node_agg
      WHERE workspace_id = {workspaceId:String}
        AND flow_id = {flowId:String}
        AND analytics_id = {analyticsId:String}
        AND node_id = {nodeId:String}
        AND event_type = 'message:delivered'
    `

    const buttonStatsSql = `
      SELECT uniqMerge(uniq_user) AS unique_clicked
      FROM flow_button_stats
      WHERE workspace_id = {workspaceId:String}
        AND flow_id = {flowId:String}
        AND analytics_id = {analyticsId:String}
        AND node_id = {nodeId:String}
    `

    const [nodeRows, uniqueDeliveredRows, buttonRows] = await Promise.all([
      this.query<{ event_type: string; total: string }>(nodeStatsSql, {
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        analyticsId: input.analyticsId,
        nodeId: input.nodeId,
      }),
      this.query<{ unique_delivered: string }>(uniqueDeliveredSql, {
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        analyticsId: input.analyticsId,
        nodeId: input.nodeId,
      }),
      this.query<{ unique_clicked: string }>(buttonStatsSql, {
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        analyticsId: input.analyticsId,
        nodeId: input.nodeId,
      }),
    ])

    let delivered = 0
    let failed = 0
    let seen = 0

    for (const row of nodeRows) {
      const count = Number.parseInt(row.total, 10)
      switch (row.event_type) {
        case "message:delivered":
          delivered = count
          break
        case "message:failed":
          failed = count
          break
        case "message:seen":
          seen = count
          break
        default:
          break
      }
    }

    const clicked = buttonRows[0]
      ? Number.parseInt(buttonRows[0].unique_clicked, 10)
      : 0
    const uniqueDelivered = uniqueDeliveredRows[0]
      ? Number.parseInt(uniqueDeliveredRows[0].unique_delivered, 10)
      : 0

    return {
      "message:sent": delivered + failed,
      "message:seen": seen,
      "flow:clicked": {
        clicked,
        totalUsers: uniqueDelivered,
      },
      "message:failed": failed,
    }
  }

  async getContacts(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    nodeId: string
    eventType: FlowNodeEventType
    buttonId?: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const {
      workspaceId,
      analyticsId,
      nodeId,
      eventType,
      buttonId,
      page,
      perPage,
    } = input
    const offset = (page - 1) * perPage
    const t = flowNodeStatModel

    const { eventCondition, orderColumn } = this.buildFlowEventFilter(eventType)

    const baseCondition = sql`${t.workspaceId} = ${workspaceId} AND ${t.analyticsId} = ${analyticsId} AND ${t.nodeId} = ${nodeId} AND ${eventCondition}`
    const fullCondition = buttonId
      ? sql`${baseCondition} AND ${t.buttonId} = ${buttonId}`
      : baseCondition

    const rows = await db
      .select({
        contactInboxId: t.contactInboxId,
        contactId: t.contactId,
        eventType: t.eventType,
        occurredAt: t.occurredAt,
        seenAt: t.seenAt,
        errorContent: t.errorContent,
      })
      .from(t)
      .where(fullCondition)
      .orderBy(sql`${orderColumn} DESC NULLS LAST`)
      .limit(perPage)
      .offset(offset)

    const contactInboxIds = rows.map((r) => r.contactInboxId as string)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of rows) {
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId,
        contactInboxId: row.contactInboxId,
        occurredAt: this.getFlowOccurredAt(row, eventType),
        errorContent: row.errorContent ?? undefined,
      })
    }

    return { contactInboxIds, contactEventMap }
  }

  private buildFlowEventFilter(eventType: FlowNodeEventType) {
    const t = flowNodeStatModel
    switch (eventType) {
      case "message:sent":
        return {
          eventCondition: sql`${t.eventType} IN ('message:delivered', 'message:failed')`,
          orderColumn: t.occurredAt,
        }
      case "message:delivered":
        return {
          eventCondition: sql`${t.eventType} = 'message:delivered'`,
          orderColumn: t.occurredAt,
        }
      case "message:seen":
        return {
          eventCondition: sql`${t.eventType} = 'message:delivered' AND ${t.seenAt} IS NOT NULL`,
          orderColumn: t.seenAt,
        }
      case "message:failed":
        return {
          eventCondition: sql`${t.eventType} = 'message:failed'`,
          orderColumn: t.occurredAt,
        }
      case "flow:clicked":
        return {
          eventCondition: sql`${t.eventType} = 'flow:clicked'`,
          orderColumn: t.occurredAt,
        }
      default:
        return {
          eventCondition: sql`${t.eventType} = 'message:delivered'`,
          orderColumn: t.occurredAt,
        }
    }
  }

  private getFlowOccurredAt(
    row: {
      eventType: string
      occurredAt: Date | null
      seenAt: Date | null
    },
    eventType: FlowNodeEventType,
  ): string {
    switch (eventType) {
      case "message:sent":
        return (row.occurredAt ?? new Date()).toISOString()
      case "message:delivered":
        return (row.occurredAt ?? new Date()).toISOString()
      case "message:seen":
        return (row.seenAt ?? new Date()).toISOString()
      case "message:failed":
        return (row.occurredAt ?? new Date()).toISOString()
      case "flow:clicked":
        return (row.occurredAt ?? new Date()).toISOString()
      default:
        return new Date().toISOString()
    }
  }

  async resetStatsSession(input: RemoveFlowStatsRequest): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(flowAnalyticsSessionModel)
        .set({
          deletedAt: new Date(),
        })
        .where(
          and(
            eq(flowAnalyticsSessionModel.workspaceId, input.workspaceId),
            eq(flowAnalyticsSessionModel.flowId, input.flowId),
          ),
        )

      await tx.insert(flowAnalyticsSessionModel).values({
        id: createId(),
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    })
  }

  async getFlowStats(input: FlowStatsRequest): Promise<FlowNodeStatsResponse> {
    const analyticsSession = await db.query.flowAnalyticsSessionModel.findFirst(
      {
        where: {
          workspaceId: input.workspaceId,
          flowId: input.flowId,
          deletedAt: { isNull: true },
        },
        columns: { id: true },
      },
    )

    if (!analyticsSession) {
      return {}
    }

    const flow = await db.query.flowModel.findFirst({
      where: { id: input.flowId, workspaceId: input.workspaceId },
      with: {
        flowVersion: {
          columns: {
            id: true,
            nodes: true,
            flowId: true,
          },
        },
      },
      columns: { id: true, currentVersionId: true },
    })

    if (!flow?.flowVersion) {
      return {}
    }

    const nodes = flow.flowVersion.nodes as unknown as FlowNode[]
    const sendMessageNodes = nodes.filter(
      (n): n is FlowNode & { data: SendMessageNodeSchema["data"] } =>
        n.type === NodeType.sendMessage,
    )

    if (sendMessageNodes.length === 0) {
      return {}
    }

    const analyticsId = analyticsSession.id

    const nodeIds: string[] = []
    const stepButtonMap = new Map<string, string[]>()

    for (const node of sendMessageNodes) {
      const steps = node.data?.details?.steps ?? []
      const quickReplies = node.data?.details?.quickReplies ?? []
      nodeIds.push(node.id)

      for (const step of steps) {
        const buttons = "buttons" in step ? (step.buttons ?? []) : []
        const buttonIds = [...quickReplies, ...buttons].map((b) => b.id)
        if (buttonIds.length > 0) {
          stepButtonMap.set(node.id, buttonIds)
        }
      }
    }

    if (nodeIds.length === 0) {
      return {}
    }

    // Get stats for each step using getNodeStats method
    const stepStatsPromises = nodeIds.map((nodeId) =>
      this.getNodeStats({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        analyticsId,
        nodeId,
      }),
    )

    const stepStatsResults = await Promise.all(stepStatsPromises)
    console.log({
      stepStatsResults: JSON.stringify(stepStatsResults, null, "\t"),
    })

    const result: FlowNodeStatsResponse = {}

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i]
      const stepStat = stepStatsResults[i]
      const buttonIds = stepButtonMap.get(nodeId) || []

      result[nodeId] = {
        node: {
          "message:sent": stepStat["message:sent"],
          "message:seen": stepStat["message:seen"],
          "flow:clicked": {
            clicked: stepStat["flow:clicked"].clicked,
            totalUsers: stepStat["flow:clicked"].totalUsers,
          },
          "message:failed": stepStat["message:failed"],
        },
        buttons: Object.fromEntries(
          buttonIds.map((buttonId) => [buttonId, { buttonId, clicks: 0 }]),
        ),
      }
    }

    // Get button stats for all steps
    const buttonStatsQuery = `
      SELECT
        node_id,
        button_id,
        uniqMerge(uniq_user) AS unique_clicks
      FROM flow_button_stats
      WHERE workspace_id = {workspaceId:String}
        AND flow_id = {flowId:String}
        AND analytics_id = {analyticsId:String}
        AND node_id IN (${nodeIds.map((id) => `'${id}'`).join(", ")})
      GROUP BY node_id, button_id
    `

    const buttonStatsRows = await this.query<{
      node_id: string
      button_id: string
      unique_clicks: string
    }>(buttonStatsQuery, {
      workspaceId: input.workspaceId,
      flowId: input.flowId,
      analyticsId,
    })

    for (const row of buttonStatsRows) {
      const nodeStats = result[row.node_id]
      if (!nodeStats) {
        continue
      }

      nodeStats.buttons[row.button_id] = {
        buttonId: row.button_id,
        clicks: Number.parseInt(row.unique_clicks, 10),
      }
    }

    return result
  }
}

export const flowStatsRepository = new FlowStatsRepository()
