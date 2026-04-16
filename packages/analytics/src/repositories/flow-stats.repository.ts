import type {
  FlowNodeContactStateType,
  FlowStatEventType,
} from "@chatbotx.io/clickhouse/schemas"
import { db, sql } from "@chatbotx.io/database/client"
import { flowNodeStatModel } from "@chatbotx.io/database/schema"
import { FlowEventType, MessageEventType } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { ContactEventData } from "../schemas/common"
import type {
  ClickHouseButtonStatsRow,
  ClickHouseContactRow,
  ClickHouseStatsRow,
  FlowNodeEventType,
  FlowNodeStatClickedItem,
  FlowNodeStatSeenItem,
  FlowNodeStats,
  FlowNodeStatTimestampField,
  FlowNodeStatUpdateItem,
} from "../schemas/flow-stats"
import { BaseRepository } from "./base.repository"

export class FlowStatsRepository extends BaseRepository {
  async insertEvents(events: FlowStatEventType[]): Promise<void> {
    if (events.length === 0) {
      return
    }
    await this.insert("flow_stat_events", events)
  }

  async insertState(states: FlowNodeContactStateType[]): Promise<void> {
    if (states.length === 0) {
      return
    }
    await this.insert("flow_node_contact_state", states)
  }

  private async upsertRecords(items: FlowNodeStatUpdateItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const tuples = items.map(
      (i) => sql`(${i.analyticsId}, ${i.nodeId}, ${i.contactId})`,
    )

    const existing = await db.execute<{
      analyticsId: string
      nodeId: string
      contactId: string
    }>(sql`
      SELECT "analyticsId", "nodeId", "contactId"
      FROM "FlowNodeStat"
      WHERE ("analyticsId", "nodeId", "contactId") IN (${sql.join(tuples, sql`, `)})
    `)

    const existingSet = new Set(
      existing.rows.map((r) => `${r.analyticsId}:${r.nodeId}:${r.contactId}`),
    )

    const newItems = items.filter(
      (i) => !existingSet.has(`${i.analyticsId}:${i.nodeId}:${i.contactId}`),
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
    }))

    await db
      .insert(flowNodeStatModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          flowNodeStatModel.analyticsId,
          flowNodeStatModel.nodeId,
          flowNodeStatModel.contactId,
        ],
      })
  }

  async updateTimestamp(
    field: FlowNodeStatTimestampField,
    items: FlowNodeStatUpdateItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return
    }

    await this.upsertRecords(items)

    const tuples = items.map(
      (i) => sql`(${i.analyticsId}, ${i.nodeId}, ${i.contactId})`,
    )

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET ${sql.raw(`"${field}"`)} = NOW()
      WHERE ("analyticsId", "nodeId", "contactId") IN (${sql.join(tuples, sql`, `)})
        AND ${sql.raw(`"${field}"`)} IS NULL
    `)
  }

  async updateClicked(items: FlowNodeStatClickedItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    await this.upsertRecords(items)

    const tuples = items.map(
      (i) => sql`(${i.analyticsId}, ${i.nodeId}, ${i.contactId})`,
    )

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET "clickedAt" = NOW(),
          "buttonId" = CASE
            ${sql.join(
              items.map(
                (i) =>
                  sql`WHEN "analyticsId" = ${i.analyticsId} AND "nodeId" = ${i.nodeId} AND "contactId" = ${i.contactId} THEN ${i.buttonId}`,
              ),
              sql` `,
            )}
            ELSE "buttonId"
          END
      WHERE ("analyticsId", "nodeId", "contactId") IN (${sql.join(tuples, sql`, `)})
        AND "clickedAt" IS NULL
    `)
  }

  async updateSeenAt(items: FlowNodeStatSeenItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const cases = items
      .map(
        (item) =>
          `WHEN "contactInboxId" = '${item.contactInboxId}' THEN ${item.occurredAt.getTime()}`,
      )
      .join(" ")

    const contactInboxIdTuples = items.map((i) => sql`${i.contactInboxId}`)

    await db.execute(sql`
      UPDATE "FlowNodeStat"
      SET "seenAt" = (CASE ${sql.raw(cases)} ELSE "seenAt" END)::text
      WHERE "contactInboxId" IN (${sql.join(contactInboxIdTuples, sql`, `)})
        AND "seenAt" IS NULL
    `)
  }

  async getNodeStats(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    stepId: string
  }): Promise<FlowNodeStats> {
    const eventTypes = [
      ...Object.values(MessageEventType),
      ...Object.values(FlowEventType),
    ]
    const sql = `
      SELECT
        event_type,
        uniq(contact_id) as count
      FROM flow_stat_events
      WHERE workspace_id = {workspaceId:String}
        AND flow_id = {flowId:String}
        AND analytics_id = {analyticsId:String}
        AND node_id = {stepId:String}
        AND event_type IN (${eventTypes.map((t) => `'${t}'`).join(", ")})
      GROUP BY event_type
    `

    const rows = await this.query<ClickHouseStatsRow>(sql, {
      workspaceId: input.workspaceId,
      flowId: input.flowId,
      analyticsId: input.analyticsId,
      stepId: input.stepId,
    })

    const stats: FlowNodeStats = {
      "message:sent": 0,
      "message:delivered": 0,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    }

    for (const row of rows) {
      const count = Number.parseInt(row.count, 10)
      switch (row.event_type) {
        case MessageEventType["message:sent"]:
          stats["message:sent"] = count
          break
        case MessageEventType["message:delivered"]:
          stats["message:delivered"] = count
          break
        case MessageEventType["message:seen"]:
          stats["message:seen"] = count
          break
        case FlowEventType["flow:clicked"]:
          stats["flow:clicked"] = count
          break
        case MessageEventType["message:failed"]:
          stats["message:failed"] = count
          break
        default:
          break
      }
    }

    return stats
  }

  async getButtonStats(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    stepId: string
  }): Promise<Array<{ buttonId: string; clicks: number }>> {
    const sql = `
      SELECT
        button_id,
        uniq(contact_id) as clicks
      FROM flow_stat_events
      WHERE workspace_id = {workspaceId:String}
        AND flow_id = {flowId:String}
        AND analytics_id = {analyticsId:String}
        AND node_id = {stepId:String}
        AND event_type = {eventType:String}
        AND button_id != ''
      GROUP BY button_id
      ORDER BY clicks DESC
    `

    const rows = await this.query<ClickHouseButtonStatsRow>(sql, {
      workspaceId: input.workspaceId,
      flowId: input.flowId,
      analyticsId: input.analyticsId,
      stepId: input.stepId,
      eventType: FlowEventType["flow:clicked"],
    })

    return rows.map((row) => ({
      buttonId: row.button_id,
      clicks: Number.parseInt(row.clicks, 10),
    }))
  }

  async getContactsFromClickHouse(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    stepId: string
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
      flowId,
      analyticsId,
      stepId,
      eventType,
      buttonId,
      page,
      perPage,
    } = input
    const offset = (page - 1) * perPage

    let eventTypeFilter = [eventType]
    if (eventType === "message:sent") {
      eventTypeFilter = ["message:delivered", "message:failed"]
    }

    let buttonFilter = ""
    if (buttonId) {
      buttonFilter = "AND button_id = {buttonId:String}"
    }

    const contactRows = await this.query<ClickHouseContactRow>(
      `
        SELECT
          contact_inbox_id,
          contact_id,
          argMax(content, occurred_at) as content,
          max(occurred_at) as max_occurred_at,
          argMax(source_id, occurred_at) as source_id,
          any(channel) as channel
        FROM flow_stat_events
        WHERE workspace_id = {workspaceId:String}
          AND flow_id = {flowId:String}
          AND analytics_id = {analyticsId:String}
          AND node_id = {stepId:String}
          AND event_type in {eventTypeFilter:Array(String)}
          ${buttonFilter}
        GROUP BY contact_inbox_id, contact_id
        ORDER BY max_occurred_at DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      {
        workspaceId,
        flowId,
        analyticsId,
        stepId,
        eventTypeFilter,
        buttonId: buttonId ?? "",
        limit: perPage,
        offset,
      },
    )

    const contactInboxIds = contactRows.map((row) => row.contact_inbox_id)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of contactRows) {
      let errorContent: string | null | undefined
      if (row.content) {
        try {
          const parsed = JSON.parse(row.content)
          if (parsed.error) {
            errorContent =
              typeof parsed.error === "string"
                ? parsed.error
                : (parsed.error.message ?? JSON.stringify(parsed.error))
          }
        } catch {
          errorContent = null
        }
      }

      contactEventMap.set(row.contact_inbox_id, {
        contactId: row.contact_id,
        occurredAt: row.max_occurred_at,
        sourceId: row.source_id,
        channel: row.channel,
        errorContent,
      })
    }

    return { contactInboxIds, contactEventMap }
  }
}

export const flowStatsRepository = new FlowStatsRepository()
