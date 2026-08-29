import { and, db, desc, eq, inArray } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"
import { assertDeletable } from "../template/installed-resource.service"

type SelectOptionRow = { id: string; name: string }
const OPTION_LIST_LIMIT = 500

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
}

export const reflinkService = new ReflinkService()
