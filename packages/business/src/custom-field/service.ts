import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type RelationsFieldFilter,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { customFieldModel } from "@chatbotx.io/database/schema"
import type { CustomFieldModel } from "@chatbotx.io/database/types"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { folderService } from "../folder/service"
import type { PaginatedResult } from "../types"

type ListCustomFieldsInput = {
  workspaceId: string
  folderId?: string | null
  name?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

type CreateCustomFieldData = {
  name: string
  type: CustomFieldType
  description?: string | null
  folderId?: string | null
}

type UpdateCustomFieldData = Partial<CreateCustomFieldData>

class CustomFieldService extends BaseService {
  async list(
    input: ListCustomFieldsInput,
  ): Promise<PaginatedResult<CustomFieldModel>> {
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
      db.query.customFieldModel.findMany({ where, orderBy, ...pagination }),
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

  async findByKey(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<CustomFieldModel | undefined> {
    const { workspaceId, key, tx = db } = props
    return await withCache(
      `custom-fields:${workspaceId}:key:${key}`,
      async () => {
        if (isNumericId(key)) {
          const byId = await tx.query.customFieldModel.findFirst({
            where: { id: key, workspaceId },
          })
          if (byId) {
            return byId
          }
        }
        return await tx.query.customFieldModel.findFirst({
          where: { name: key, workspaceId },
        })
      },
      {
        dynamicTags: (result) =>
          result
            ? [
                "custom-fields",
                `custom-fields:${workspaceId}`,
                `custom-fields:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<CustomFieldModel> {
    const field = await this.findByKey(props)
    if (!field) {
      throw notFoundException("Custom field not found")
    }
    return field
  }

  async findBy(props: {
    where: Partial<{
      id?: RelationsFieldFilter<string>
      workspaceId?: RelationsFieldFilter<string>
      name?: RelationsFieldFilter<string>
    }>
    tx?: DatabaseClient
  }): Promise<CustomFieldModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.customFieldModel.findFirst({ where })
  }

  async create(props: {
    workspaceId: string
    data: CreateCustomFieldData
    tx?: DatabaseClient
  }): Promise<CustomFieldModel> {
    const { workspaceId, data, tx = db } = props

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
      })
    }

    const [field] = await tx
      .insert(customFieldModel)
      .values({ id: createId(), workspaceId, showInInbox: true, ...data })
      .returning()

    await this.invalidate({ workspaceId })
    return field
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: UpdateCustomFieldData,
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel> {
    const existing = await this.findByKeyOrFail({
      workspaceId: ctx.workspaceId,
      key: ctx.id,
      tx,
    })

    if (data.folderId && data.folderId !== existing.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId: ctx.workspaceId,
        folderType: "customField",
      })
    }

    const [updated] = await tx
      .update(customFieldModel)
      .set(data)
      .where(eq(customFieldModel.id, existing.id))
      .returning()

    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [existing.id] })
    return updated
  }

  async delete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, tx = db } = props

    await tx
      .delete(customFieldModel)
      .where(
        and(
          eq(customFieldModel.workspaceId, workspaceId),
          inArray(customFieldModel.id, ids),
        ),
      )

    await this.invalidate({ workspaceId, ids })
  }

  async invalidate(props: {
    workspaceId: string
    ids?: string[]
  }): Promise<void> {
    const tags = [
      "custom-fields",
      `custom-fields:${props.workspaceId}`,
      ...(props.ids?.map((id) => `custom-fields:${props.workspaceId}:${id}`) ??
        []),
    ]
    await this.invalidateCacheTags(tags)
  }
}

export const customFieldService = new CustomFieldService()
