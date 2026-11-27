import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  lt,
  sql,
} from "../../client"
import {
  type ExportSubType,
  fileContextTypes,
  fileStatuses,
} from "../../partials/file"
import { fileModel, userModel } from "../../schema"
import type { FileModel } from "../../types"

/**
 * A keyset position in `(createdAt, id)` order. `createdAt` is the column in
 * UTC with its microseconds (`2026-10-20T10:00:00.123456Z`): a JS `Date` would
 * truncate them to milliseconds and skip the rows in between.
 */
export type ExportFileCursor = { createdAt: string; id: string }

/** One past export of a workspace, with who asked for it (null for a token). */
export type ExportFileListItem = Pick<
  FileModel,
  "id" | "status" | "fileName" | "meta" | "createdAt" | "userId"
> & { requestedByName: string | null; createdAtCursor: string }

/** A function, so importing the repository does not read the schema. */
const createdAtCursor = () =>
  sql<string>`to_char(${fileModel.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** Rows strictly past `cursor` when reading in `order` by `(createdAt, id)`. */
const pastCursor = (
  cursor: ExportFileCursor | undefined,
  order: "asc" | "desc",
) =>
  cursor
    ? sql`(${fileModel.createdAt}, ${fileModel.id}) ${order === "desc" ? sql`<` : sql`>`} (${cursor.createdAt}::timestamptz, ${cursor.id}::bigint)`
    : undefined

/** Every export of one kind in a workspace; `userId` narrows to its creator. */
const exportScope = (input: {
  workspaceId: string
  subType: ExportSubType
  userId?: string
}) =>
  and(
    eq(fileModel.workspaceId, input.workspaceId),
    eq(fileModel.contextType, fileContextTypes.enum.export),
    eq(fileModel.subType, input.subType),
    input.userId ? eq(fileModel.userId, input.userId) : undefined,
  )

export const fileRepository = {
  /**
   * Updates a `File` row scoped to `(id, workspaceId)` so a caller can never
   * write another workspace's upload row. Used by the contact-export job to
   * persist progress/status on its own export file.
   */
  async updateForWorkspace(
    input: {
      id: string
      workspaceId: string
      values: Partial<typeof fileModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(fileModel)
      .set(input.values)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /**
   * Updates a `File` row only while it is still `pending`, scoped to
   * `(id, workspaceId)`. Returns whether it did: a settle (uploaded or failed)
   * uses it, so a duplicate or stalled run can never overwrite a file that
   * already settled.
   */
  async updatePendingForWorkspace(
    input: {
      id: string
      workspaceId: string
      values: Partial<typeof fileModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const updated = await tx
      .update(fileModel)
      .set(input.values)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
          eq(fileModel.status, fileStatuses.enum.pending),
        ),
      )
      .returning({ id: fileModel.id })
    return updated.length > 0
  },

  /**
   * Claims the FIRST execution of an export job: updates the row only while it
   * is `pending` and no execution has stamped a heartbeat yet, in one
   * statement. Of several concurrent executions of one job (a stalled-job
   * recovery starting a second run while the first still works) exactly one
   * gets `true`; the others must not read or upload.
   */
  async claimFirstRunForWorkspace(
    input: {
      id: string
      workspaceId: string
      values: Partial<typeof fileModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const updated = await tx
      .update(fileModel)
      .set(input.values)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
          eq(fileModel.status, fileStatuses.enum.pending),
          sql`${fileModel.meta}->>${"heartbeatAt"}::text IS NULL`,
        ),
      )
      .returning({ id: fileModel.id })
    return updated.length > 0
  },

  /**
   * A workspace's export files of one kind that are still `pending`, newest
   * first, at most `limit` (the caller bounds what it counts). Reads through
   * `File_workspaceId_subType_idx`. For the cap on running exports.
   */
  async listPendingExportsForWorkspace(
    input: { workspaceId: string; subType: ExportSubType; limit: number },
    tx: DatabaseClient = db,
  ): Promise<Pick<FileModel, "createdAt" | "id" | "meta" | "status">[]> {
    return await tx
      .select({
        createdAt: fileModel.createdAt,
        id: fileModel.id,
        meta: fileModel.meta,
        status: fileModel.status,
      })
      .from(fileModel)
      .where(
        and(
          eq(fileModel.workspaceId, input.workspaceId),
          eq(fileModel.subType, input.subType),
          eq(fileModel.contextType, fileContextTypes.enum.export),
          eq(fileModel.status, fileStatuses.enum.pending),
        ),
      )
      .orderBy(desc(fileModel.createdAt))
      .limit(input.limit)
  },

  /**
   * Ownership proof for a presigned-upload `File` row — scoped to
   * `(id, workspaceId)` so a caller can never probe another workspace's
   * upload by guessing a `fileId`. Used by the messaging-ad creative
   * preflight (and any future create-time bytes read-back) to verify a
   * caller-supplied `fileId` actually belongs to THIS workspace before its
   * `path` is trusted — never trust the request body's key alone.
   */
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string; userId?: string },
    tx: DatabaseClient = db,
  ): Promise<FileModel | null> {
    const [row] = await tx
      .select()
      .from(fileModel)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
          input.userId ? eq(fileModel.userId, input.userId) : undefined,
        ),
      )
      .limit(1)
    return row ?? null
  },

  async create(
    values: typeof fileModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<FileModel> {
    const [row] = await tx.insert(fileModel).values(values).returning()
    return row
  },

  /**
   * A workspace's exports of one kind, newest first, keyset-paginated. Fetches
   * one row past `limit` so the caller can tell whether another page exists.
   * Exports are deleted after their retention, so a workspace holds few.
   */
  async listExportsForWorkspace(
    input: {
      workspaceId: string
      subType: ExportSubType
      userId?: string
      limit: number
      cursor?: ExportFileCursor
    },
    tx: DatabaseClient = db,
  ): Promise<ExportFileListItem[]> {
    return await tx
      .select({
        id: fileModel.id,
        status: fileModel.status,
        fileName: fileModel.fileName,
        meta: fileModel.meta,
        createdAt: fileModel.createdAt,
        userId: fileModel.userId,
        requestedByName: userModel.name,
        createdAtCursor: createdAtCursor(),
      })
      .from(fileModel)
      .leftJoin(userModel, eq(userModel.id, fileModel.userId))
      .where(and(exportScope(input), pastCursor(input.cursor, "desc")))
      .orderBy(desc(fileModel.createdAt), desc(fileModel.id))
      .limit(input.limit + 1)
  },

  /**
   * Exports of the given kinds created before `before`, oldest first, across every
   * workspace: the retention sweep's batch. `after` resumes past the previous
   * batch, so rows kept for a retry never block the ones behind them. Reads
   * the export-only `File_export_createdAt_idx`, never the whole table.
   */
  async listExportsCreatedBefore(
    input: {
      subTypes: ExportSubType[]
      before: Date
      limit: number
      after?: ExportFileCursor
    },
    tx: DatabaseClient = db,
  ): Promise<
    (Pick<FileModel, "id" | "workspaceId" | "path"> & {
      createdAtCursor: string
    })[]
  > {
    return await tx
      .select({
        id: fileModel.id,
        workspaceId: fileModel.workspaceId,
        path: fileModel.path,
        createdAtCursor: createdAtCursor(),
      })
      .from(fileModel)
      .where(
        and(
          eq(fileModel.contextType, fileContextTypes.enum.export),
          inArray(fileModel.subType, input.subTypes),
          lt(fileModel.createdAt, input.before),
          pastCursor(input.after, "asc"),
        ),
      )
      .orderBy(asc(fileModel.createdAt), asc(fileModel.id))
      .limit(input.limit)
  },

  /**
   * One batch of a workspace's export files of every kind (the workspace purge
   * drains them before the cascade, which would drop the rows but not the
   * stored objects). Bounded; the caller deletes what it got and asks again.
   */
  async listWorkspaceExportsBatch(
    input: { workspaceId: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<Pick<FileModel, "id" | "path">[]> {
    return await tx
      .select({ id: fileModel.id, path: fileModel.path })
      .from(fileModel)
      .where(
        and(
          eq(fileModel.workspaceId, input.workspaceId),
          eq(fileModel.contextType, fileContextTypes.enum.export),
        ),
      )
      .limit(input.limit)
  },

  async deleteById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx.delete(fileModel).where(eq(fileModel.id, input.id))
  },
}
