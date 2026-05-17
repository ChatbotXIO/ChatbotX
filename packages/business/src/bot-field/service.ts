import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { botFieldModel, customFieldModel } from "@chatbotx.io/database/schema"
import type { BotFieldModel } from "@chatbotx.io/database/types"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { folderService } from "../folder/service"
import type { PaginatedResult } from "../types"

type ListBotFieldsInput = {
  workspaceId: string
  folderId?: string | null
  name?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

type CreateBotFieldData = {
  name: string
  type: CustomFieldType
  value?: string | null
  description?: string | null
  folderId?: string | null
}

type UpdateBotFieldData = Partial<CreateBotFieldData>

const REGEX_BOT_FIELD_ID = /^\d+$/

class BotFieldService extends BaseService {
  async list(
    input: ListBotFieldsInput,
  ): Promise<PaginatedResult<BotFieldModel>> {
    const where = {
      workspaceId: input.workspaceId,
      folderId: input.folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          input.folderId === rootFolderId
          ? { isNull: true as const }
          : input.folderId
        : undefined,
      name: input.name ? { ilike: `%${input.name.toLowerCase()}%` } : undefined,
    }

    const orderBy = parseOrderByAsObject(customFieldModel, input)
    const pagination = parsePagination(input)

    const [data, total] = await Promise.all([
      db.query.botFieldModel.findMany({ where, orderBy, ...pagination }),
      db.$count(
        customFieldModel,
        relationsFilterToSQL(customFieldModel, where),
      ),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(total / pagination.limit)
      : 1

    return { data, pageCount }
  }

  async find(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel | undefined> {
    const { workspaceId, id, tx = db } = props
    return await withCache(
      `bot-fields:${workspaceId}:id:${id}`,
      async () =>
        await tx.query.botFieldModel.findFirst({
          where: { id, workspaceId },
        }),
      {
        dynamicTags: (result) =>
          result
            ? [
                "bot-fields",
                `bot-fields:${workspaceId}`,
                `bot-fields:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findOrFail(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const botField = await this.find(props)
    if (!botField) {
      throw notFoundException("Bot field not found")
    }
    return botField
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel | undefined> {
    const { workspaceId, key, tx = db } = props
    return await withCache(
      `bot-fields:${workspaceId}:key:${key}`,
      async () =>
        await tx.query.botFieldModel.findFirst({
          where: {
            [REGEX_BOT_FIELD_ID.test(key) ? "id" : "name"]: key,
            workspaceId,
          },
        }),
      {
        dynamicTags: (result) =>
          result
            ? [
                "bot-fields",
                `bot-fields:${workspaceId}`,
                `bot-fields:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const botField = await this.findByKey(props)
    if (!botField) {
      throw notFoundException("Bot field not found")
    }
    return botField
  }

  async create(props: {
    workspaceId: string
    data: CreateBotFieldData
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const { workspaceId, data, tx = db } = props

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
      })
    }

    const [botField] = await tx
      .insert(botFieldModel)
      .values({ id: createId(), workspaceId, ...data })
      .returning()

    await this.invalidate({ workspaceId })
    return botField
  }

  async updateByKey(props: {
    workspaceId: string
    key: string
    data: UpdateBotFieldData
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const { workspaceId, key, data, tx = db } = props
    const existing = await this.findByKeyOrFail({ workspaceId, key, tx })

    if (data.folderId && data.folderId !== existing.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
      })
    }

    const [updated] = await tx
      .update(botFieldModel)
      .set(data)
      .where(eq(botFieldModel.id, existing.id))
      .returning()

    await this.invalidate({ workspaceId, ids: [existing.id] })

    return updated
  }

  async deleteByKey(props: {
    workspaceId: string
    key: string
  }): Promise<void> {
    const botField = await this.findByKeyOrFail({
      workspaceId: props.workspaceId,
      key: props.key,
    })

    await this.bulkDelete({
      workspaceId: props.workspaceId,
      ids: [botField.id],
    })
  }

  async bulkDelete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, tx = db } = props

    await tx
      .delete(botFieldModel)
      .where(
        and(
          eq(botFieldModel.workspaceId, workspaceId),
          inArray(botFieldModel.id, ids),
        ),
      )

    await this.invalidate({ workspaceId, ids })
  }

  async invalidate(props: {
    workspaceId: string
    ids?: string[]
  }): Promise<void> {
    const tags = [
      "bot-fields",
      `bot-fields:${props.workspaceId}`,
      ...(props.ids?.map((id) => `bot-fields:${props.workspaceId}:${id}`) ??
        []),
    ]
    await this.invalidateCacheTags(tags)
  }
}

export const botFieldService = new BotFieldService()
