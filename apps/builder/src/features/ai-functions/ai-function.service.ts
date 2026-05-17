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

  async create(
    workspaceId: string,
    data: CreateAIFunctionRequest,
    tx?: DatabaseClient,
  ) {
    const client = tx ?? db
    return await client
      .insert(aiFunctionModel)
      .values({
        ...data,
        id: createId(),
        workspaceId,
      })
      .returning()
  }

  async update(id: string, data: UpdateAIFunctionRequest, tx?: DatabaseClient) {
    const client = tx ?? db
    return await client
      .update(aiFunctionModel)
      .set(data)
      .where(eq(aiFunctionModel.id, id))
      .returning()
  }

  async delete(id: string, tx?: DatabaseClient) {
    const client = tx ?? db
    return await client
      .delete(aiFunctionModel)
      .where(eq(aiFunctionModel.id, id))
      .returning()
  }
}

export const aiFunctionService = new AiFunctionService()
