import {
  type DatabaseClient,
  db,
  type RelationsFieldFilter,
} from "@chatbotx.io/database/client"
import type { AIMCPServerModel } from "@chatbotx.io/database/types"
import { BaseService } from "../common/base.service"

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id?: RelationsFieldFilter<string>
    workspaceId?: RelationsFieldFilter<string>
    name?: RelationsFieldFilter<string>
  }>
}

class AiMcpServerService extends BaseService {
  async findBy(props: FindByProps): Promise<AIMCPServerModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.aiMCPServerModel.findFirst({
      where,
    })
  }

  async list(props: {
    tx?: DatabaseClient
    where: Partial<{
      workspaceId?: string
    }>
  }): Promise<AIMCPServerModel[]> {
    const { tx = db, where } = props
    return await tx.query.aiMCPServerModel.findMany({
      where,
    })
  }
}

export const aiMcpServerService = new AiMcpServerService()
