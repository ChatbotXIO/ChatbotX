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
    WHERE "ctid" IN (
      SELECT "ctid"
      FROM ${tableSql}
      WHERE "workspaceId" = ${workspaceId}
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
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

const deletePartitionedBatch = async (
  spec: PartitionedWorkspaceTable,
  workspaceId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<number> => {
  const columns = quotedColumns(spec.primaryKey)
  const table = quotedTable(spec.table)
  const result =
    spec.selector === "broadcastWorkspace"
      ? await tx.execute(sql`
          DELETE FROM ${table}
          WHERE (${columns}) IN (
            SELECT ${sql.join(
              spec.primaryKey.map(
                (column) => sql`recipient.${sql.raw(`"${column}"`)}`,
              ),
              sql`, `,
            )}
            FROM "ContactOnBroadcast" AS recipient
            INNER JOIN "Broadcast" AS broadcast
              ON broadcast."id" = recipient."broadcastId"
            WHERE broadcast."workspaceId" = ${workspaceId}
            LIMIT ${limit}
            FOR UPDATE OF recipient SKIP LOCKED
          )
        `)
      : await tx.execute(sql`
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
  const result =
    spec.selector === "broadcastWorkspace"
      ? await tx.execute(sql`
          SELECT 1
          FROM "ContactOnBroadcast" AS recipient
          INNER JOIN "Broadcast" AS broadcast
            ON broadcast."id" = recipient."broadcastId"
          WHERE broadcast."workspaceId" = ${workspaceId}
          LIMIT 1
        `)
      : await tx.execute(sql`
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
