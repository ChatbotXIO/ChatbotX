import { and, db, desc, eq, ilike, isNull, type SQL } from "../../client"
import { mediaLibraryFileModel } from "../../schema"
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
  async findById(input: { workspaceId: string; id: string }) {
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
}
