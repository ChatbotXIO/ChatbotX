import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, isDatabaseError } from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  type CreateCustomFieldParams,
  customFieldRepository,
  type ListCustomFieldsParams,
} from "@chatbotx.io/database/repositories"
import type { CustomFieldModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { folderService } from "../folder/service"
import type { PaginatedResult } from "../types"

type CreateCustomFieldData = Omit<CreateCustomFieldParams, "workspaceId">

type UpdateCustomFieldData = Partial<CreateCustomFieldData>

const NAME_TYPE_UNIQUE_CONSTRAINT = "CustomField_workspaceId_type_name_key"

/**
 * Pre-check races a concurrent create/rename for the same (workspace, type,
 * name) — the unique index is the actual guard. Catching only this
 * constraint's 23505 keeps an unrelated conflict from being mislabeled
 * "Name is already taken".
 */
const isNameTypeUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === NAME_TYPE_UNIQUE_CONSTRAINT
  )
}

class CustomFieldService extends BaseService {
  async list(
    input: ListCustomFieldsParams,
  ): Promise<PaginatedResult<CustomFieldModel>> {
    return await customFieldRepository.list(input)
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<CustomFieldModel | undefined> {
    const { workspaceId, key, tx = db } = props
    return await withCache(
      `custom-fields:${workspaceId}:key:${key}`,
      async () =>
        await customFieldRepository.findByKey({ workspaceId, key }, tx),
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
      id?: string | { in: string[] }
      workspaceId?: string
      name?: string
    }>
    tx?: DatabaseClient
  }): Promise<CustomFieldModel | undefined> {
    return await customFieldRepository.findBy(props, props.tx)
  }

  /**
   * Batched lookup for export: ids come from the exported flow graph, which is
   * untrusted input, so `workspaceId` is required alongside `inArray(id, ids)`
   * — without it a stale or planted id could leak another workspace's field
   * name. Ids that don't resolve (already-deleted fields) are simply absent
   * from the result; callers must not treat that as an error.
   */
  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<CustomFieldModel[]> {
    return await customFieldRepository.findManyByIds(props, props.tx)
  }

  /**
   * Resolves flow-import custom-field references by `(name, type)`. See
   * `customFieldRepository.resolveByNameAndType` for the collision-resolution
   * and idempotent-insert rationale.
   */
  async resolveByNameAndType(props: {
    workspaceId: string
    fields: { name: string; type: CustomFieldType }[]
    tx?: DatabaseClient
  }): Promise<{ idMap: Map<string, string>; createdIds: string[] }> {
    return await customFieldRepository.resolveByNameAndType(props, props.tx)
  }

  async create(props: {
    workspaceId: string
    data: CreateCustomFieldData
    tx?: DatabaseClient
  }): Promise<CustomFieldModel> {
    const { workspaceId, data, tx = db } = props

    const nameTaken = await customFieldRepository.existsByNameAndType(
      { workspaceId, type: data.type, name: data.name },
      tx,
    )
    if (nameTaken) {
      throw new ChatbotXException("Name is already taken", "nameTaken", 400)
    }

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
        tx,
      })
    }

    let field: CustomFieldModel
    try {
      field = await customFieldRepository.create({ workspaceId, ...data }, tx)
    } catch (error) {
      if (isNameTypeUniqueViolation(error)) {
        throw new ChatbotXException("Name is already taken", "nameTaken", 400)
      }
      throw error
    }

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

    if (data.name) {
      const duplicate = await customFieldRepository.existsByNameAndType(
        {
          workspaceId: ctx.workspaceId,
          type: existing.type,
          name: data.name,
          excludeId: existing.id,
        },
        tx,
      )
      if (duplicate) {
        throw new ChatbotXException("Name is already taken", "nameTaken", 400)
      }
    }

    if (data.folderId && data.folderId !== existing.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId: ctx.workspaceId,
        folderType: "customField",
        tx,
      })
    }

    let updated: CustomFieldModel | undefined
    try {
      updated = await customFieldRepository.update(
        { id: existing.id, data },
        tx,
      )
    } catch (error) {
      if (isNameTypeUniqueViolation(error)) {
        throw new ChatbotXException("Name is already taken", "nameTaken", 400)
      }
      throw error
    }
    if (!updated) {
      throw notFoundException("Custom field not found")
    }

    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [existing.id] })
    return updated
  }

  async delete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, tx = db } = props

    await customFieldRepository.delete({ workspaceId, ids }, tx)

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
