import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isUniqueViolationError,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { magicLinkModel } from "@chatbotx.io/database/schema"
import type { MagicLinkModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"

type CreateMagicLinkData = Omit<
  typeof magicLinkModel.$inferInsert,
  "id" | "workspaceId"
>

type UpdateMagicLinkData = Partial<CreateMagicLinkData>

type ListMagicLinksInput = {
  workspaceId: string
  page?: number | null
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string | null
}

type ListMagicLinksResult = {
  data: MagicLinkModel[]
  pageCount: number
}

class MagicLinkService extends BaseService {
  async create(input: {
    workspaceId: string
    data: CreateMagicLinkData
    tx?: DatabaseClient
  }): Promise<MagicLinkModel> {
    const { tx = db, workspaceId, data } = input
    try {
      const [created] = await tx
        .insert(magicLinkModel)
        .values({
          id: createId(),
          workspaceId,
          ...data,
        })
        .returning()
      return created
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<MagicLinkModel> {
    const link = await this.findByWorkspace(input)
    if (!link) {
      throw notFoundException("Magic link not found")
    }
    return link
  }

  async update(input: {
    workspaceId: string
    id: string
    data: UpdateMagicLinkData
  }): Promise<MagicLinkModel> {
    const link = await this.findOrFail(input)
    try {
      const [updated] = await db
        .update(magicLinkModel)
        .set(input.data)
        .where(
          and(
            eq(magicLinkModel.id, link.id),
            eq(magicLinkModel.workspaceId, input.workspaceId),
          ),
        )
        .returning()
      return updated
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.findOrFail(input)
    await this.deleteMany({ workspaceId: input.workspaceId, ids: [input.id] })
  }

  async deleteMany(input: { workspaceId: string; ids: string[] }) {
    if (input.ids.length === 0) {
      return
    }
    await db
      .delete(magicLinkModel)
      .where(
        and(
          eq(magicLinkModel.workspaceId, input.workspaceId),
          inArray(magicLinkModel.id, input.ids),
        ),
      )
  }

  async list(input: ListMagicLinksInput): Promise<ListMagicLinksResult> {
    const where = {
      workspaceId: input.workspaceId,
      ...(input.keyword
        ? {
            OR: [
              { name: { ilike: likeContains(input.keyword) } },
              { url: { ilike: likeContains(input.keyword) } },
            ],
          }
        : {}),
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(magicLinkModel, input)

    const [data, totalRows] = await Promise.all([
      db.query.magicLinkModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(magicLinkModel, relationsFilterToSQL(magicLinkModel, where)),
    ])

    const pageCount = Math.ceil(totalRows / input.perPage)

    return { data, pageCount }
  }

  async findByWorkspace(input: {
    workspaceId: string
    id: string
  }): Promise<MagicLinkModel | undefined> {
    return await db.query.magicLinkModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
    })
  }

  async findByName(input: {
    workspaceId: string
    name: string
  }): Promise<MagicLinkModel | undefined> {
    return await db.query.magicLinkModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        name: input.name,
      },
    })
  }
}

export const magicLinkService = new MagicLinkService()
