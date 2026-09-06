import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import type { ReflinkModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { validationException } from "../errors"
import { assertDeletable } from "../template/installed-resource.service"

type SelectOptionRow = { id: string; name: string }
const OPTION_LIST_LIMIT = 500

type CreateReflinkData = Omit<
  typeof reflinkModel.$inferInsert,
  "id" | "workspaceId" | "type"
>

class ReflinkService extends BaseService {
  async listOptions(input: {
    workspaceId: string
  }): Promise<SelectOptionRow[]> {
    return await db
      .select({
        id: reflinkModel.id,
        name: reflinkModel.name,
      })
      .from(reflinkModel)
      .where(
        and(
          eq(reflinkModel.workspaceId, input.workspaceId),
          eq(reflinkModel.type, "refLink"),
        ),
      )
      .orderBy(desc(reflinkModel.createdAt))
      .limit(OPTION_LIST_LIMIT)
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "reflink",
      resourceIds: input.ids,
    })

    await db
      .delete(reflinkModel)
      .where(
        and(
          eq(reflinkModel.workspaceId, input.workspaceId),
          inArray(reflinkModel.id, input.ids),
        ),
      )
  }

  async create(input: {
    workspaceId: string
    data: CreateReflinkData
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db, workspaceId, data } = input
    try {
      await tx.insert(reflinkModel).values({
        id: createId(),
        workspaceId,
        type: "refLink",
        ...data,
      })
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async findRefLink(input: {
    workspaceId: string
    id: string
  }): Promise<ReflinkModel | undefined> {
    return await db.query.reflinkModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        type: "refLink",
      },
    })
  }
}

export const reflinkService = new ReflinkService()
