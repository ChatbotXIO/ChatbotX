import { and, count, db, eq, sql } from "@chatbotx.io/database/client"
import { flowNodeStatModel } from "@chatbotx.io/database/schema"
import {
  type FlowNode,
  messageEventTypeSchema,
  nodeTypeSchema,
  type SendMessageNodeSchema,
} from "@chatbotx.io/flow-config"
import type {
  FlowNodeStats,
  FlowNodeStatsResponse,
  FlowStatsRequest,
} from "../../schemas/flow-stats"
import { BaseRepository } from "./base.repository"

export class FlowStatsPgRepository extends BaseRepository {
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
}

export const flowStatsPgRepository = new FlowStatsPgRepository()
