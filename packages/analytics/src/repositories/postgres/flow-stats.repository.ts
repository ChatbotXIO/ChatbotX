import { and, count, db, eq, sql } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowNodeStatModel,
} from "@chatbotx.io/database/schema"
import {
  type FlowNode,
  messageEventTypeSchema,
  nodeTypeSchema,
  type SendMessageNodeSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { ContactEventData } from "../../schemas/common"
import type {
  FlowNodeEventType,
  FlowNodeStatItem,
  FlowNodeStatSeenItem,
  FlowNodeStats,
  FlowNodeStatsResponse,
  FlowStatsRequest,
  RemoveFlowStatsRequest,
} from "../../schemas/flow-stats"
import { BaseRepository } from "./base.repository"

export class FlowStatsRepository extends BaseRepository {
  async getNodeStats(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    nodeId: string
  }): Promise<FlowNodeStats> {
    const { workspaceId, analyticsId, nodeId } = input
    const t = flowNodeStatModel

    const [statsResult, uniqueDeliveredResult, clickedResult] =
      await Promise.all([
        db
          .select({
            eventType: t.eventType,
            total: count(),
            totalSeen: sql<number>`COUNT("seenAt")`,
          })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.analyticsId, analyticsId),
              eq(t.nodeId, nodeId),
              sql`${t.eventType} IN ('message:delivered', 'message:failed')`,
            ),
          )
          .groupBy(t.eventType),
        db
          .select({
            count: sql<number>`COUNT(DISTINCT ${t.contactInboxId})`,
          })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.analyticsId, analyticsId),
              eq(t.nodeId, nodeId),
              eq(t.eventType, messageEventTypeSchema.enum["message:delivered"]),
            ),
          ),
        db
          .select({
            count: sql<number>`COUNT(DISTINCT ${t.contactInboxId})`,
          })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.analyticsId, analyticsId),
              eq(t.nodeId, nodeId),
              eq(t.eventType, "flow:clicked"),
            ),
          ),
      ])

    let delivered = 0
    let failed = 0
    let seen = 0

    for (const row of statsResult) {
      switch (row.eventType) {
        case "message:delivered":
          delivered = Number(row.total)
          seen = Number(row.totalSeen)
          break
        case "message:failed":
          failed = Number(row.total)
          break
        default:
          break
      }
    }

    const clicked = Number(clickedResult[0]?.count ?? 0)
    const uniqueDelivered = Number(uniqueDeliveredResult[0]?.count ?? 0)

    return {
      "message:sent": delivered + failed,
      "message:seen": seen,
      "message:delivered": delivered,
      "flow:clicked": {
        clicked,
        totalUsers: uniqueDelivered,
      },
      "message:failed": failed,
    }
  }

  async insertNodeStats(data: FlowNodeStatItem[]): Promise<void> {
    if (data.length === 0) {
      return
    }
    await db.insert(flowNodeStatModel).values(data).onConflictDoNothing()
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
        n.type === nodeTypeSchema.enum.sendMessage,
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

    const stepStatsPromises = nodeIds.map((nodeId) =>
      this.getNodeStats({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        analyticsId,
        nodeId,
      }),
    )

    const stepStatsResults = await Promise.all(stepStatsPromises)

    const result: FlowNodeStatsResponse = {}

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i]
      const stepStat = stepStatsResults[i]
      const buttonIds = stepButtonMap.get(nodeId) || []

      result[nodeId] = {
        node: {
          "message:sent": stepStat["message:sent"],
          "message:seen": stepStat["message:seen"],
          "message:delivered": stepStat["message:delivered"], // TODO: need to implement delivered logic
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

    const t = flowNodeStatModel
    const buttonStatsRows = await db
      .select({
        nodeId: t.nodeId,
        buttonId: t.buttonId,
        uniqueClicks: sql<number>`COUNT(DISTINCT ${t.contactInboxId})`,
      })
      .from(t)
      .where(
        and(
          eq(t.workspaceId, input.workspaceId),
          eq(t.flowId, input.flowId),
          eq(t.analyticsId, analyticsId),
          sql`${t.nodeId} IN (${sql.join(
            nodeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(t.eventType, "flow:clicked"),
          sql`${t.buttonId} IS NOT NULL`,
        ),
      )
      .groupBy(t.nodeId, t.buttonId)

    for (const row of buttonStatsRows) {
      const nodeStats = result[row.nodeId]
      if (!nodeStats) {
        continue
      }

      if (!row.buttonId) {
        continue
      }

      nodeStats.buttons[row.buttonId] = {
        buttonId: row.buttonId,
        clicks: Number(row.uniqueClicks),
      }
    }

    return result
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

    const { eventCondition, orderColumn } = this.buildEventFilter(eventType)

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
        occurredAt: this.getFlowNodeOccurredAt(row, eventType),
        errorContent: row.errorContent ?? undefined,
      })
    }

    return { contactInboxIds, contactEventMap }
  }

  async resetStatsSession(input: RemoveFlowStatsRequest): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(flowAnalyticsSessionModel)
        .set({ deletedAt: new Date() })
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

  private buildEventFilter(eventType: FlowNodeEventType) {
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

  private getFlowNodeOccurredAt(
    row: {
      eventType: string
      occurredAt: Date | null
      seenAt: Date | null
    },
    eventType: FlowNodeEventType,
  ): string {
    switch (eventType) {
      case "message:seen":
        return (row.seenAt ?? new Date()).toISOString()
      default:
        return (row.occurredAt ?? new Date()).toISOString()
    }
  }
}

export const flowStatsRepository = new FlowStatsRepository()
