import {
  and,
  type DatabaseClient,
  db,
  eq,
  sql,
} from "@chatbotx.io/database/client"
import {
  type MacEventType,
  workspaceMacMonthlyModel,
} from "@chatbotx.io/database/schema"

export type MonthlyCounterRow = {
  workspaceId: string
  billingId: string
  periodStart: string
  periodEnd: string | null
  macCount: number
}

export type PreparedRow = {
  workspaceId: string
  contactId: string
  contactInboxId: string
  inboxId: string
  eventType: MacEventType
  occurredAt: Date
  hourBucket: Date
  localDate: string
  localPeriodStart: string
  localPeriodEnd: string
  billingId: string
}

type CounterDelta = {
  workspaceId: string
  period: string
  periodEnd: string
  billingId: string
  count: number
}

function buildHourlyInsertValues(rows: PreparedRow[]) {
  return sql.join(
    rows.map(
      (r) => sql`(
        ${r.workspaceId},
        ${r.contactId},
        ${r.contactInboxId},
        ${r.eventType},
        ${r.inboxId},
        ${r.hourBucket.toISOString()}
      )`,
    ),
    sql`, `,
  )
}

function buildMonthlyInsertValues(rows: PreparedRow[]) {
  return sql.join(
    rows.map(
      (r) => sql`(
        ${r.workspaceId},
        ${r.contactId},
        ${r.contactInboxId},
        ${r.localPeriodStart},
        ${r.localPeriodEnd},
        ${r.inboxId},
        ${r.billingId}
      )`,
    ),
    sql`, `,
  )
}

export class MacRepository {
  async upsertActivityHourly(
    rows: PreparedRow[],
    client: DatabaseClient = db,
  ): Promise<void> {
    if (rows.length === 0) {
      return
    }

    await client.execute(sql`
      INSERT INTO "ContactActivityHourly"
        ("workspaceId", "contactId", "contactInboxId", "eventType", "inboxId", "hourBucket")
      VALUES ${buildHourlyInsertValues(rows)}
      ON CONFLICT ("hourBucket", "workspaceId", "contactInboxId", "eventType", "inboxId") DO NOTHING
    `)
  }

  async upsertMonthlyPresence(
    rows: PreparedRow[],
    client: DatabaseClient = db,
  ): Promise<CounterDelta[]> {
    if (rows.length === 0) {
      return []
    }

    const result = await client.execute<{
      workspaceId: string
      period: string
      periodEnd: string
      billingId: string
      cnt: number
    }>(sql`
      WITH inserted AS (
        INSERT INTO "ContactActiveMonthly"
          ("workspaceId", "contactId", "contactInboxId", "periodStart", "periodEnd", "inboxId", "billingId")
        VALUES ${buildMonthlyInsertValues(rows)}
        ON CONFLICT ("workspaceId", "periodStart", "contactInboxId", "billingId") DO NOTHING
        RETURNING "workspaceId", "periodStart", "periodEnd", "billingId"
      )
      SELECT
        "workspaceId"::text AS "workspaceId",
        to_char("periodStart", 'YYYY-MM-DD') AS "period",
        to_char("periodEnd", 'YYYY-MM-DD') AS "periodEnd",
        "billingId"::text AS "billingId",
        count(*) AS "cnt"
      FROM inserted
      GROUP BY "workspaceId", "periodStart", "periodEnd", "billingId"
    `)

    return result.rows.map((r) => ({
      workspaceId: r.workspaceId,
      period: r.period,
      periodEnd: r.periodEnd,
      billingId: r.billingId,
      count: r.cnt,
    }))
  }

  async incrementMonthlyCounters(
    deltas: CounterDelta[],
    client: DatabaseClient = db,
  ): Promise<MonthlyCounterRow[]> {
    if (deltas.length === 0) {
      return []
    }

    const values = sql.join(
      deltas.map(
        (d) => sql`(
          ${d.workspaceId},
          ${d.period},
          ${d.periodEnd},
          ${d.count},
          ${d.billingId},
          now()
        )`,
      ),
      sql`, `,
    )

    const result = await client.execute<{
      workspaceId: string
      billingId: string
      periodStart: string
      periodEnd: string | null
      macCount: number
    }>(sql`
      INSERT INTO "WorkspaceMacMonthly"
        ("workspaceId", "periodStart", "periodEnd", "macCount", "billingId", "updatedAt")
      VALUES ${values}
      ON CONFLICT ("workspaceId", "periodStart", "billingId") DO UPDATE SET
        "macCount"  = "WorkspaceMacMonthly"."macCount" + EXCLUDED."macCount",
        "updatedAt" = now()
      WHERE "WorkspaceMacMonthly"."lockedAt" IS NULL
      RETURNING
        "workspaceId"::text AS "workspaceId",
        "billingId"::text AS "billingId",
        to_char("periodStart", 'YYYY-MM-DD') AS "periodStart",
        to_char("periodEnd", 'YYYY-MM-DD') AS "periodEnd",
        "macCount"
    `)

    return result.rows.map((row) => ({
      workspaceId: row.workspaceId,
      billingId: row.billingId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      macCount: Number(row.macCount),
    }))
  }

  async getActiveContactCount(input: {
    workspaceId: string
    billingId: string
  }): Promise<{
    periodStart: string
    periodEnd: string | null
    macCount: number
  }> {
    const row = await db
      .select({
        periodStart: workspaceMacMonthlyModel.periodStart,
        periodEnd: workspaceMacMonthlyModel.periodEnd,
        macCount: workspaceMacMonthlyModel.macCount,
      })
      .from(workspaceMacMonthlyModel)
      .where(
        and(
          eq(workspaceMacMonthlyModel.workspaceId, input.workspaceId),
          eq(workspaceMacMonthlyModel.billingId, input.billingId),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    return {
      periodStart: row?.periodStart,
      periodEnd: row?.periodEnd,
      macCount: row?.macCount ?? 0,
    }
  }

  async getDailyBreakdown(input: {
    workspaceId: string
    from: string
    to: string
  }): Promise<{ period: string; macCount: number }[]> {
    const rows = await db.execute<{ period: string; macCount: number }>(sql`
      SELECT
        to_char(date_trunc('day', "hourBucket"), 'YYYY-MM-DD') AS "period",
        count(DISTINCT "contactInboxId")::int AS "macCount"
      FROM "ContactActivityHourly"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "hourBucket" >= ${input.from}
        AND "hourBucket" <  ${input.to}
      GROUP BY 1
      ORDER BY 1
    `)
    return rows.rows.map((r) => ({
      period: r.period,
      macCount: Number(r.macCount),
    }))
  }

  async reconcilePeriod(input: {
    workspaceId: string
    periodStart: string
    periodEnd: string
  }): Promise<void> {
    await db.execute(sql`
      WITH total AS (
        SELECT count(*)::int AS cnt
        FROM "ContactActiveMonthly"
        WHERE "workspaceId" = ${input.workspaceId}::bigint
          AND "periodStart" = ${input.periodStart}
      )
      INSERT INTO "WorkspaceMacMonthly" ("workspaceId", "periodStart", "periodEnd", "macCount", "updatedAt")
      SELECT
        ${input.workspaceId}::bigint,
        ${input.periodStart},
        ${input.periodEnd},
        total.cnt,
        now()
      FROM total
      ON CONFLICT ("workspaceId", "periodStart") DO UPDATE SET
        "macCount" = EXCLUDED."macCount",
        "periodEnd" = EXCLUDED."periodEnd",
        "updatedAt" = now()
      WHERE "WorkspaceMacMonthly"."lockedAt" IS NULL
    `)
  }
}

export const macRepository = new MacRepository()
