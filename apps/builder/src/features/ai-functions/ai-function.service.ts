import {
  type DatabaseClient,
  db,
  eq,
  type RelationsFieldFilter,
} from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../common/base.service"
import type {
  CreateAIFunctionRequest,
  UpdateAIFunctionRequest,
} from "./schemas/action"

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id?: RelationsFieldFilter<string>
    workspaceId?: RelationsFieldFilter<string>
    name?: RelationsFieldFilter<string>
  }>
}

class AiFunctionService extends BaseService {
  async findBy(props: FindByProps): Promise<AIFunctionModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.aiFunctionModel.findFirst({
      where,
    })
  }

  async create(workspaceId: string, data: CreateAIFunctionRequest) {
    return await db
      .insert(aiFunctionModel)
      .values({
        ...data,
        id: createId(),
        workspaceId,
      })
      .returning()
  }

  async update(id: string, data: UpdateAIFunctionRequest) {
    return await db
      .update(aiFunctionModel)
      .set(data)
      .where(eq(aiFunctionModel.id, id))
      .returning()
  }

  async delete(id: string) {
    return await db
      .delete(aiFunctionModel)
      .where(eq(aiFunctionModel.id, id))
      .returning()
  }
}

export const aiFunctionService = new AiFunctionService()
