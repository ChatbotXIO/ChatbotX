import {
  type DatabaseClient,
  db,
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
import { validationException } from "../errors"

type CreateMagicLinkData = Omit<
  typeof magicLinkModel.$inferInsert,
  "id" | "workspaceId"
>

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
  }): Promise<void> {
    const { tx = db, workspaceId, data } = input
    try {
      await tx.insert(magicLinkModel).values({
        id: createId(),
        workspaceId,
        ...data,
      })
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
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
