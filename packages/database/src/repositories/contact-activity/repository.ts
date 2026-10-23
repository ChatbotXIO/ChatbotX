import { type DatabaseClient, db, sql } from "../../client"
import type {
  ContactActivityReferenceType,
  ContactActivityType,
} from "../../partials/contact-activity"

export type ContactActivityRecord = {
  activityType: ContactActivityType
  contactId: string
  occurredAt: Date
  parentReferenceId: string
  referenceId: string
  referenceType: ContactActivityReferenceType
}

export type ContactKeywordMessageRecord = {
  automatedResponseId: string
  contactId: string
  messageId: string
  normalizedText: string
  occurredAt: Date
  text: string
}

export type ContactDeliveredRecord = {
  contactId: string
  deliveredAt: Date
}

/**
 * Primary-key columns after `workspaceId`, per activity table. Purge walks a
 * table by primary key (a `ctid` repeats across partitions); the table name is
 * only ever one of these compile-time keys, never request input.
 */
export const CONTACT_ACTIVITY_TABLE_KEYS = {
  ContactActivity: [
    "contactId",
    "activityType",
    "referenceType",
    "parentReferenceId",
    "referenceId",
  ],
  ContactKeywordMessage: ["contactId", "messageId"],
  ContactState: ["contactId"],
} as const satisfies Record<string, readonly string[]>

export type ContactActivityTable = keyof typeof CONTACT_ACTIVITY_TABLE_KEYS

export const CONTACT_ACTIVITY_TABLES = Object.keys(
  CONTACT_ACTIVITY_TABLE_KEYS,
) as ContactActivityTable[]

const asArray = (values: unknown[], pgType: string) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::${sql.raw(pgType)}[]`

const asBigintArray = (ids: string[]) => asArray(ids, "bigint")

const keyColumns = (table: ContactActivityTable) =>
  sql.join(
    [
      sql`"workspaceId"`,
      ...CONTACT_ACTIVITY_TABLE_KEYS[table].map((column) =>
        sql.identifier(column),
      ),
    ],
    sql`, `,
  )

/**
 * Every insert is an `INSERT … SELECT` from workspace-scoped `Contact` rows
 * taken `FOR KEY SHARE` in id order, so a write racing a contact delete or a
 * workspace purge either lands before it or inserts nothing (the tables have
 * no FKs). Callers hold the workspace fence first.
 */
export const contactActivityRepository = {
  /** `firstOccurredAt` only ever moves earlier; callers dedupe by key first. */
  async upsertActivities(
    input: { records: ContactActivityRecord[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    if (input.records.length === 0) {
      return 0
    }
    const column = <Key extends keyof ContactActivityRecord>(key: Key) =>
      input.records.map((record) => record[key])

    const result = await tx.execute(sql`
      INSERT INTO "ContactActivity"
        ("workspaceId", "contactId", "activityType", "referenceType",
         "parentReferenceId", "referenceId", "firstOccurredAt")
      SELECT c."workspaceId", c."id", v."activityType", v."referenceType",
             v."parentReferenceId", v."referenceId", v."occurredAt"
      FROM unnest(
        ${asBigintArray(column("contactId"))},
        ${asArray(column("activityType"), '"contactActivityType"')},
        ${asArray(column("referenceType"), '"contactActivityReferenceType"')},
        ${asBigintArray(column("parentReferenceId"))},
        ${asBigintArray(column("referenceId"))},
        ${asArray(column("occurredAt"), "timestamptz")}
      ) AS v("contactId", "activityType", "referenceType", "parentReferenceId", "referenceId", "occurredAt")
      JOIN "Contact" c
        ON c."id" = v."contactId"
       AND c."workspaceId" = ${input.workspaceId}::bigint
      ORDER BY c."id", v."activityType", v."referenceType", v."parentReferenceId", v."referenceId"
      FOR KEY SHARE OF c
      ON CONFLICT ("workspaceId", "contactId", "activityType", "referenceType", "parentReferenceId", "referenceId")
      DO UPDATE SET "firstOccurredAt" = EXCLUDED."firstOccurredAt"
      WHERE EXCLUDED."firstOccurredAt" < "ContactActivity"."firstOccurredAt"
    `)

    return result.rowCount ?? 0
  },

  /** Keyed by `messageId`, so a retried dispatch cannot duplicate the text. */
  async insertKeywordMessage(
    input: { record: ContactKeywordMessageRecord; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const { record } = input
    const result = await tx.execute(sql`
      INSERT INTO "ContactKeywordMessage"
        ("workspaceId", "contactId", "messageId", "automatedResponseId",
         "text", "normalizedText", "occurredAt")
      SELECT c."workspaceId", c."id", ${record.messageId}::bigint,
             ${record.automatedResponseId}::bigint, ${record.text},
             ${record.normalizedText}, ${record.occurredAt}::timestamptz
      FROM "Contact" c
      WHERE c."id" = ${record.contactId}::bigint
        AND c."workspaceId" = ${input.workspaceId}::bigint
      FOR KEY SHARE OF c
      ON CONFLICT ("workspaceId", "contactId", "messageId") DO NOTHING
    `)

    return (result.rowCount ?? 0) > 0
  },

  /** `lastDeliveredAt` only ever moves later, so a duplicate is a no-op write. */
  async upsertLastDelivered(
    input: { records: ContactDeliveredRecord[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    if (input.records.length === 0) {
      return 0
    }

    const result = await tx.execute(sql`
      INSERT INTO "ContactState" ("workspaceId", "contactId", "lastDeliveredAt")
      SELECT c."workspaceId", c."id", v."deliveredAt"
      FROM unnest(
        ${asBigintArray(input.records.map((record) => record.contactId))},
        ${asArray(
          input.records.map((record) => record.deliveredAt),
          "timestamptz",
        )}
      ) AS v("contactId", "deliveredAt")
      JOIN "Contact" c
        ON c."id" = v."contactId"
       AND c."workspaceId" = ${input.workspaceId}::bigint
      ORDER BY c."id"
      FOR KEY SHARE OF c
      ON CONFLICT ("workspaceId", "contactId")
      DO UPDATE SET "lastDeliveredAt" = EXCLUDED."lastDeliveredAt"
      WHERE "ContactState"."lastDeliveredAt" IS NULL
         OR EXCLUDED."lastDeliveredAt" > "ContactState"."lastDeliveredAt"
    `)

    return result.rowCount ?? 0
  },

  async deleteByContactIds(
    input: { contactIds: string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    const contactIds = Array.from(new Set(input.contactIds))
    if (contactIds.length === 0) {
      return 0
    }

    let deleted = 0
    for (const table of CONTACT_ACTIVITY_TABLES) {
      const result = await tx.execute(sql`
        DELETE FROM ${sql.identifier(table)}
        WHERE "workspaceId" = ${input.workspaceId}::bigint
          AND "contactId" = ANY(${asBigintArray(contactIds)})
      `)
      deleted += result.rowCount ?? 0
    }

    return deleted
  },

  async deleteWorkspaceBatch(input: {
    limit: number
    table: ContactActivityTable
    workspaceId: string
  }): Promise<number> {
    const table = sql.identifier(input.table)
    const columns = keyColumns(input.table)
    const result = await db.execute(sql`
      DELETE FROM ${table}
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND (${columns}) IN (
          SELECT ${columns}
          FROM ${table}
          WHERE "workspaceId" = ${input.workspaceId}::bigint
          ORDER BY ${columns}
          LIMIT ${input.limit}
        )
    `)

    return result.rowCount ?? 0
  },

  async hasWorkspaceRows(input: {
    table: ContactActivityTable
    workspaceId: string
  }): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT 1
      FROM ${sql.identifier(input.table)}
      WHERE "workspaceId" = ${input.workspaceId}::bigint
      LIMIT 1
    `)

    return result.rows.length > 0
  },
}
