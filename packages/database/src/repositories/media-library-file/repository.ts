import {
  and,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  type SQL,
  sql,
} from "../../client"
import { mediaLibraryFileModel } from "../../schema"
import type { MediaLibraryFileModel } from "../../types"

export type MediaLibraryFileFolderCount = {
  folderId: string | null
  count: number
}

export const mediaLibraryFileRepository = {
  async findByPath(input: { workspaceId: string; path: string }) {
    const [file] = await db
      .select()
      .from(mediaLibraryFileModel)
      .where(
        and(
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
          eq(mediaLibraryFileModel.path, input.path),
        ),
      )
      .limit(1)

    return file ?? null
  },

  async findById(input: { id: string; workspaceId: string }) {
    const [file] = await db
      .select()
      .from(mediaLibraryFileModel)
      .where(
        and(
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
          eq(mediaLibraryFileModel.id, input.id),
        ),
      )
      .limit(1)

    return file ?? null
  },

  async list(input: {
    workspaceId: string
    filter?: string | null
    folderId?: string | null
    search?: string | null
    page?: number
    perPage: number
  }) {
    const conditions: SQL[] = [
      eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
    ]

    if (input.filter === "favourite") {
      conditions.push(eq(mediaLibraryFileModel.isFavourite, true))
    } else if (input.folderId) {
      conditions.push(eq(mediaLibraryFileModel.folderId, input.folderId))
    } else if (!input.filter) {
      conditions.push(isNull(mediaLibraryFileModel.folderId))
    }

    if (input.search) {
      conditions.push(ilike(mediaLibraryFileModel.name, `%${input.search}%`))
    }

    const orderByColumn =
      input.filter === "recent"
        ? desc(mediaLibraryFileModel.lastAccessedAt)
        : desc(mediaLibraryFileModel.createdAt)

    const page = input.page ?? 1

    const data = await db
      .select()
      .from(mediaLibraryFileModel)
      .where(and(...conditions))
      .orderBy(orderByColumn)
      .limit(input.perPage)
      .offset((page - 1) * input.perPage)

    return data
  },

  countByFolder(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFileFolderCount[]> {
    return tx
      .select({
        folderId: mediaLibraryFileModel.folderId,
        count: count(),
      })
      .from(mediaLibraryFileModel)
      .where(eq(mediaLibraryFileModel.workspaceId, input.workspaceId))
      .groupBy(mediaLibraryFileModel.folderId)
  },

  listByFolder(
    input: { workspaceId: string; folderId: string },
    tx: DatabaseClient = db,
  ): Promise<Pick<MediaLibraryFileModel, "id" | "path">[]> {
    return tx.query.mediaLibraryFileModel.findMany({
      where: {
        folderId: input.folderId,
        workspaceId: input.workspaceId,
      },
      columns: { id: true, path: true },
    })
  },

  async create(
    values: typeof mediaLibraryFileModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFileModel> {
    const [file] = await tx
      .insert(mediaLibraryFileModel)
      .values(values)
      .returning()
    return file
  },

  async deleteById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mediaLibraryFileModel)
      .where(
        and(
          eq(mediaLibraryFileModel.id, input.id),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async deleteByFolder(
    input: { workspaceId: string; folderId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mediaLibraryFileModel)
      .where(
        and(
          eq(mediaLibraryFileModel.folderId, input.folderId),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async moveToFolder(
    input: { workspaceId: string; fileIds: string[]; folderId: string | null },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFileModel)
      .set({ folderId: input.folderId })
      .where(
        and(
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
          inArray(mediaLibraryFileModel.id, input.fileIds),
        ),
      )
  },

  async setFavourite(
    input: { id: string; workspaceId: string; isFavourite: boolean },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFileModel)
      .set({ isFavourite: input.isFavourite })
      .where(
        and(
          eq(mediaLibraryFileModel.id, input.id),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async touchLastAccessedAt(
    input: { workspaceId: string; fileId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFileModel)
      .set({ lastAccessedAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(mediaLibraryFileModel.id, input.fileId),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
