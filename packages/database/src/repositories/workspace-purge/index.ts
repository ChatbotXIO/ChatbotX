export * from "./tables"

import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  liftDecompressionLimit,
  sql,
} from "../../client"
import { attachmentModel, messageModel } from "../../schema"
import type {
  HeavyWorkspaceTable,
  PartitionedWorkspaceTable,
  WorkspaceAnalyticsHypertable,
  WorkspacePurgeTable,
} from "./tables"

const quotedTable = (table: string) => sql.raw(`"${table}"`)
const quotedColumns = (columns: readonly string[]) =>
  sql.join(
    columns.map((column) => sql.raw(`"${column}"`)),
    sql`, `,
  )

const deleteWorkspaceRowsBatch = async (
  table:
    | HeavyWorkspaceTable
    | "CoexistSyncRun"
    | "FlowAnalyticsSession"
    | "MessageCleanup",
  workspaceId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<number> => {
  const tableSql = quotedTable(table)
  const result = await tx.execute(sql`
    DELETE FROM ${tableSql}
    WHERE "ctid" = ANY(ARRAY(
      SELECT "ctid"
      FROM ${tableSql}
      WHERE "workspaceId" = ${workspaceId}
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ))
  `)
  return result.rowCount ?? 0
}

const hasWorkspaceRows = async (
  table: WorkspacePurgeTable,
  workspaceId: string,
  tx: DatabaseClient = db,
): Promise<boolean> => {
  const result = await tx.execute(sql`
    SELECT 1
    FROM ${quotedTable(table)}
    WHERE "workspaceId" = ${workspaceId}
    LIMIT 1
  `)
  return result.rows.length > 0
}

// Link tables without a `workspaceId`, drained through the parent that has one.
const JOINED_PARENTS = {
  channelPostWorkspace: { childKey: "channelPostId", table: "ChannelPost" },
  socialPostWorkspace: { childKey: "socialPostId", table: "SocialPost" },
} as const

const joinedParent = (spec: PartitionedWorkspaceTable) =>
  spec.selector === "socialPostWorkspace" ||
  spec.selector === "channelPostWorkspace"
    ? JOINED_PARENTS[spec.selector]
    : null

const deletePartitionedBatch = async (
  spec: PartitionedWorkspaceTable,
  workspaceId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<number> => {
  const columns = quotedColumns(spec.primaryKey)
  const table = quotedTable(spec.table)
  const aliased = (alias: string) =>
    sql.join(
      spec.primaryKey.map(
        (column) => sql`${sql.raw(alias)}.${sql.raw(`"${column}"`)}`,
      ),
      sql`, `,
    )
  if (spec.selector === "broadcastWorkspace") {
    const result = await tx.execute(sql`
      DELETE FROM ${table}
      WHERE (${columns}) IN (
        SELECT ${aliased("recipient")}
        FROM "ContactOnBroadcast" AS recipient
        INNER JOIN "Broadcast" AS broadcast
          ON broadcast."id" = recipient."broadcastId"
        WHERE broadcast."workspaceId" = ${workspaceId}
        LIMIT ${limit}
        FOR UPDATE OF recipient SKIP LOCKED
      )
    `)
    return result.rowCount ?? 0
  }
  const parent = joinedParent(spec)
  if (parent) {
    // These link tables have no `workspaceId`: they are selected through their
    // parent. They are not partitioned, so `ctid = ANY(ARRAY(...))` is valid and
    // evaluates the limited, locking subquery once; an `IN (...)` semi-join may
    // re-run it and delete more than `limit` rows. Partitioned tables cannot use
    // `ctid` (it is per partition), so they delete by primary-key tuple below.
    const result = await tx.execute(sql`
      DELETE FROM ${table}
      WHERE "ctid" = ANY(ARRAY(
        SELECT child."ctid"
        FROM ${table} AS child
        INNER JOIN ${quotedTable(parent.table)} AS parent
          ON parent."id" = child.${sql.raw(`"${parent.childKey}"`)}
        WHERE parent."workspaceId" = ${workspaceId}
        LIMIT ${limit}
        FOR UPDATE OF child SKIP LOCKED
      ))
    `)
    return result.rowCount ?? 0
  }
  const result = await tx.execute(sql`
    DELETE FROM ${table}
    WHERE (${columns}) IN (
      SELECT ${columns}
      FROM ${table}
      WHERE "workspaceId" = ${workspaceId}
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
  `)
  return result.rowCount ?? 0
}

const hasPartitionedWorkspaceRows = async (
  spec: PartitionedWorkspaceTable,
  workspaceId: string,
  tx: DatabaseClient = db,
): Promise<boolean> => {
  if (spec.selector === "broadcastWorkspace") {
    const result = await tx.execute(sql`
      SELECT 1
      FROM "ContactOnBroadcast" AS recipient
      INNER JOIN "Broadcast" AS broadcast
        ON broadcast."id" = recipient."broadcastId"
      WHERE broadcast."workspaceId" = ${workspaceId}
      LIMIT 1
    `)
    return result.rows.length > 0
  }
  const parent = joinedParent(spec)
  if (parent) {
    const result = await tx.execute(sql`
      SELECT 1
      FROM ${quotedTable(spec.table)} AS child
      INNER JOIN ${quotedTable(parent.table)} AS parent
        ON parent."id" = child.${sql.raw(`"${parent.childKey}"`)}
      WHERE parent."workspaceId" = ${workspaceId}
      LIMIT 1
    `)
    return result.rows.length > 0
  }
  const result = await tx.execute(sql`
    SELECT 1
    FROM ${quotedTable(spec.table)}
    WHERE "workspaceId" = ${workspaceId}
    LIMIT 1
  `)
  return result.rows.length > 0
}

const findNextAnalyticsRowAt = async (
  table: WorkspaceAnalyticsHypertable,
  workspaceId: string,
  tx: DatabaseClient = db,
): Promise<Date | null> => {
  const result = await tx.execute<{ occurredAt: string }>(sql`
    SELECT "occurredAt"
    FROM ${quotedTable(table)}
    WHERE "workspaceId" = ${workspaceId}
    ORDER BY "occurredAt" ASC
    LIMIT 1
  `)
  const occurredAt = result.rows[0]?.occurredAt
  return occurredAt ? new Date(occurredAt) : null
}

const deleteAnalyticsSlice = async (
  table: WorkspaceAnalyticsHypertable,
  workspaceId: string,
  from: Date,
  to: Date,
  tx: DatabaseClient = db,
): Promise<number> => {
  await liftDecompressionLimit(tx)
  const result = await tx.execute(sql`
    DELETE FROM ${quotedTable(table)}
    WHERE "workspaceId" = ${workspaceId}
      AND "occurredAt" >= ${from}
      AND "occurredAt" < ${to}
  `)
  return result.rowCount ?? 0
}

const listMessageConversationPage = async (
  table: "Message" | "Attachment",
  workspaceId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<string[]> => {
  const result = await tx.execute<{ conversationId: string }>(sql`
    SELECT DISTINCT "conversationId"
    FROM ${quotedTable(table)}
    WHERE "workspaceId" = ${workspaceId}
    ORDER BY "conversationId" ASC
    LIMIT ${limit}
  `)
  return result.rows.map((row) => row.conversationId)
}

const deleteMessagesAndAttachments = async (
  workspaceId: string,
  conversationIds: string[],
  tx: DatabaseClient = db,
): Promise<number> => {
  await liftDecompressionLimit(tx)
  const [messages, attachments] = await Promise.all([
    tx
      .delete(messageModel)
      .where(
        and(
          eq(messageModel.workspaceId, workspaceId),
          inArray(messageModel.conversationId, conversationIds),
        ),
      ),
    tx
      .delete(attachmentModel)
      .where(
        and(
          eq(attachmentModel.workspaceId, workspaceId),
          inArray(attachmentModel.conversationId, conversationIds),
        ),
      ),
  ])
  return (messages.rowCount ?? 0) + (attachments.rowCount ?? 0)
}

export const workspacePurgeRepository = {
  deleteAnalyticsSlice,
  deleteMessagesAndAttachments,
  deletePartitionedBatch,
  deleteWorkspaceRowsBatch,
  findNextAnalyticsRowAt,
  hasPartitionedWorkspaceRows,
  hasWorkspaceRows,
  listMessageConversationPage,
}
