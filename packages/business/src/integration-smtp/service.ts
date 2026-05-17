import { db } from "@chatbotx.io/database/client"
import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

class IntegrationSmtpService extends BaseService {
  find({
    where,
  }: {
    where: Partial<{ workspaceId: string; id: string }>
  }): Promise<IntegrationSmtpModel | undefined> {
    // return withCache(
    //   `integrationSmtp:find:${btoa(JSON.stringify(where))}`,
    //   () =>
    return db.query.integrationSmtpModel.findFirst({
      where,
    })
    // {
    //   tags: ["integrationSmtp"],
    // },
    // )
  }
}
export const integrationSmtpService = new IntegrationSmtpService()
