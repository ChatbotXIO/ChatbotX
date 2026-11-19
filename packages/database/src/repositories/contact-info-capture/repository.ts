import { type DatabaseClient, db, type SQL, sql } from "../../client"
import type { ContactInfoType } from "../../partials/contact"
import type { ContactInfoSourceType } from "../../partials/contact-info-capture"

export type ContactInfoCaptureInput = {
  /** When the contact sent the message, not when it was processed. */
  capturedAt: Date
  contactId: string
  contactInboxId: string
  conversationId: string
  inboxId: string
  infoTypes: ContactInfoType[]
  sourceId: string
  sourceType: ContactInfoSourceType
  workspaceId: string
}

export type ContactInfoCaptureSource = {
  sourceId: string
  sourceType: ContactInfoSourceType
  workspaceId: string
}

export type ContactInfoCaptureCountRow = {
  count: number
  infoType: ContactInfoType
  sourceId: string
}

export type ContactInfoCaptureListRow = {
  contactId: string
  contactInboxId: string
  conversationId: string
  createdAt: Date
  inboxId: string
}

const asArray = (values: unknown[], pgType: string) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::${sql.raw(pgType)}[]`

const asBigintArray = (ids: string[]) => asArray(ids, "bigint")

/**
 * Raw SQL for the FK-less, `workspaceId`-hash-partitioned `ContactInfoCapture`
 * table. Every read and write carries `workspaceId` first so a statement prunes
 * to one partition. The insert is an `INSERT … SELECT` from the workspace's
 * `Contact` row taken `FOR KEY SHARE`, so a write racing a contact delete or a
 * workspace purge either lands before it or inserts nothing. Callers hold the
 * workspace fence (`lockWorkspaceForChildWrite`) first.
 */
export const contactInfoCaptureRepository = {
  /**
   * One row per info type, idempotent on the primary key. Returns how many rows
   * were newly written (0 = already captured, or the contact is gone).
   */
  async insert(
    input: ContactInfoCaptureInput,
    tx: DatabaseClient,
  ): Promise<number> {
    if (input.infoTypes.length === 0) {
      return 0
    }
    const infoTypes = Array.from(new Set(input.infoTypes))

    const result = await tx.execute(sql`
      INSERT INTO "ContactInfoCapture"
        ("workspaceId", "sourceType", "sourceId", "infoType", "contactId",
         "contactInboxId", "inboxId", "conversationId", "createdAt")
      SELECT c."workspaceId", ${input.sourceType}::"contactInfoSourceType",
             ${input.sourceId}::bigint, t."infoType", c."id",
             ${input.contactInboxId}::bigint, ${input.inboxId}::bigint,
             ${input.conversationId}::bigint, ${input.capturedAt}::timestamptz
      FROM "Contact" c
      CROSS JOIN unnest(${asArray(infoTypes, '"contactInfoType"')}) AS t("infoType")
      WHERE c."id" = ${input.contactId}::bigint
        AND c."workspaceId" = ${input.workspaceId}::bigint
      FOR KEY SHARE OF c
      ON CONFLICT ("workspaceId", "sourceType", "sourceId", "infoType", "contactId")
      DO NOTHING
    `)

    return result.rowCount ?? 0
  },

  /** One grouped read for any number of sources (a list page), never one per source. */
  async countBySources(
    input: {
      sourceIds: string[]
      sourceType: ContactInfoSourceType
      workspaceId: string
    },
    client: DatabaseClient = db,
  ): Promise<ContactInfoCaptureCountRow[]> {
    const sourceIds = Array.from(new Set(input.sourceIds))
    if (sourceIds.length === 0) {
      return []
    }

    const result = await client.execute<{
      count: number
      infoType: ContactInfoType
      sourceId: string
    }>(sql`
      SELECT "sourceId"::text AS "sourceId", "infoType", count(*)::int AS "count"
      FROM "ContactInfoCapture"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "sourceType" = ${input.sourceType}::"contactInfoSourceType"
        AND "sourceId" = ANY(${asBigintArray(sourceIds)})
      GROUP BY "sourceId", "infoType"
    `)

    return result.rows
  },

  /**
   * Newest first by `(createdAt, contactId)`, paged with an `offset` for a
   * page-number API (bounded by the caller). Only captures whose contact inbox
   * still exists are returned: the join runs before `LIMIT`/`OFFSET`, so a page
   * is never emptied by captures of deleted inboxes and always agrees with
   * `countContacts`. `ContactInbox` has no workspace column, so it is scoped
   * through the capture's own workspace-scoped `contactId`.
   *
   * The `ORDER BY ... NULLS LAST` matches `ContactInfoCapture_source_idx`
   * (the columns are NOT NULL, so the result is the same) and the inbox check
   * is a LATERAL probe: with a plain join the planner estimates one row and
   * sorts the whole source on every page; this form walks the index in order
   * and stops after `LIMIT`.
   */
  async listContacts(
    input: ContactInfoCaptureSource & {
      infoType: ContactInfoType
      limit: number
      offset: number
    },
    client: DatabaseClient = db,
  ): Promise<ContactInfoCaptureListRow[]> {
    // node-postgres hands raw `execute` timestamps back as strings.
    const result = await client.execute<{
      contactId: string
      contactInboxId: string
      conversationId: string
      createdAt: string
      inboxId: string
    }>(sql`
      SELECT cic."contactId"::text AS "contactId",
             cic."contactInboxId"::text AS "contactInboxId",
             cic."conversationId"::text AS "conversationId",
             cic."createdAt",
             cic."inboxId"::text AS "inboxId"
      FROM "ContactInfoCapture" cic
      CROSS JOIN LATERAL (
        SELECT 1
        FROM "ContactInbox" ci
        WHERE ci."id" = cic."contactInboxId"
          AND ci."contactId" = cic."contactId"
        LIMIT 1
      ) live_inbox
      WHERE cic."workspaceId" = ${input.workspaceId}::bigint
        AND cic."sourceType" = ${input.sourceType}::"contactInfoSourceType"
        AND cic."sourceId" = ${input.sourceId}::bigint
        AND cic."infoType" = ${input.infoType}::"contactInfoType"
      ORDER BY cic."createdAt" DESC NULLS LAST, cic."contactId" DESC NULLS LAST
      LIMIT ${input.limit}
      OFFSET ${input.offset}
    `)

    return result.rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
    }))
  },

  /** Total behind `listContacts`: the same join, so the total matches the pages. */
  async countContacts(
    input: ContactInfoCaptureSource & { infoType: ContactInfoType },
    client: DatabaseClient = db,
  ): Promise<number> {
    const result = await client.execute<{ count: number }>(sql`
      SELECT count(*)::int AS "count"
      FROM "ContactInfoCapture" cic
      INNER JOIN "ContactInbox" ci
        ON ci."id" = cic."contactInboxId"
       AND ci."contactId" = cic."contactId"
      WHERE cic."workspaceId" = ${input.workspaceId}::bigint
        AND cic."sourceType" = ${input.sourceType}::"contactInfoSourceType"
        AND cic."sourceId" = ${input.sourceId}::bigint
        AND cic."infoType" = ${input.infoType}::"contactInfoType"
    `)

    return result.rows[0]?.count ?? 0
  },

  /**
   * Ascending contact-id paging (primary-key order) for bulk tagging. The
   * `ORDER BY` is table-qualified on purpose: a bare `"contactId"` resolves to
   * the `::text` output alias, which sorts lexicographically (and cannot use
   * the primary-key order) while the `afterContactId` cursor compares numbers.
   */
  async listContactIds(
    input: ContactInfoCaptureSource & {
      afterContactId?: string
      excludeContactIds?: string[]
      infoType: ContactInfoType
      limit: number
    },
    client: DatabaseClient = db,
  ): Promise<string[]> {
    const excluded = input.excludeContactIds?.length
      ? sql`AND "contactId" <> ALL(${asBigintArray(input.excludeContactIds)})`
      : sql``
    const afterContact = input.afterContactId
      ? sql`AND "contactId" > ${input.afterContactId}::bigint`
      : sql``

    const result = await client.execute<{ contactId: string }>(sql`
      SELECT "contactId"::text AS "contactId"
      FROM "ContactInfoCapture"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "sourceType" = ${input.sourceType}::"contactInfoSourceType"
        AND "sourceId" = ${input.sourceId}::bigint
        AND "infoType" = ${input.infoType}::"contactInfoType"
        ${afterContact}
        ${excluded}
      ORDER BY "ContactInfoCapture"."contactId"
      LIMIT ${input.limit}
    `)

    return result.rows.map((row) => row.contactId)
  },

  async deleteByContactIds(
    input: { contactIds: string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    const contactIds = Array.from(new Set(input.contactIds))
    if (contactIds.length === 0) {
      return 0
    }

    const result = await tx.execute(sql`
      DELETE FROM "ContactInfoCapture"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "contactId" = ANY(${asBigintArray(contactIds)})
    `)

    return result.rowCount ?? 0
  },

  /**
   * One bounded batch of a source's rows, walked by primary key (a `ctid`
   * repeats across partitions). The caller loops until it returns less than
   * `limit`, and sets the lock and deadline policy.
   */
  async deleteSourceBatch(
    input: ContactInfoCaptureSource & {
      limit: number
      /**
       * Extra condition ANDed into the delete (parameterized SQL built by the
       * caller), checked inside the statement. The source-specific owner of a
       * source type uses it for guards such as "only while the source is still
       * a draft"; this repository stays source-agnostic.
       */
      extraWhere?: SQL
    },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const extraWhere = input.extraWhere ? sql` AND ${input.extraWhere}` : sql``
    const result = await tx.execute(sql`
      DELETE FROM "ContactInfoCapture"
      WHERE "workspaceId" = ${input.workspaceId}::bigint${extraWhere}
        AND ("sourceType", "sourceId", "infoType", "contactId") IN (
          SELECT "sourceType", "sourceId", "infoType", "contactId"
          FROM "ContactInfoCapture"
          WHERE "workspaceId" = ${input.workspaceId}::bigint
            AND "sourceType" = ${input.sourceType}::"contactInfoSourceType"
            AND "sourceId" = ${input.sourceId}::bigint
          ORDER BY "infoType", "contactId"
          LIMIT ${input.limit}
        )
    `)

    return result.rowCount ?? 0
  },

  async existsForSource(
    input: ContactInfoCaptureSource,
    client: DatabaseClient = db,
  ): Promise<boolean> {
    const result = await client.execute(sql`
      SELECT 1
      FROM "ContactInfoCapture"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "sourceType" = ${input.sourceType}::"contactInfoSourceType"
        AND "sourceId" = ${input.sourceId}::bigint
      LIMIT 1
    `)

    return result.rows.length > 0
  },
}
