"use server"

import { integrationSmtpService } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { IntegrationSmtpResource } from "../schema/resource"

export const findIntegrationSmtp = async (
  input: Partial<Pick<IntegrationSmtpModel, "id" | "workspaceId">>,
): Promise<IntegrationSmtpModel> =>
  findOrFail({ table: integrationSmtpModel, where: input })

export const listIntegrationSmtps = async (input: {
  workspaceId: string
}): Promise<{ data: IntegrationSmtpResource[] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await integrationSmtpService.listByWorkspaceId(input.workspaceId)

  return {
    data: data.map(({ id, name, fromAddress }) => ({
      id,
      name,
      fromAddress,
    })),
  }
}
