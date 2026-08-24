import { db } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { integrationApiRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationApiModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"

type ConnectIntegrationApiInput = {
  ownerId: string
  workspaceId?: string
  name: string
  auth: Parameters<typeof integrationApiRepository.insert>[0]["auth"]
  tokenHash: string
  tokenPrefix: string
  callbackUrl: string | null
  createWorkspace?: (
    tx: Parameters<typeof connectChannelIntegration>[0]["tx"],
  ) => Promise<string>
}

type DisconnectIntegrationApiInput = {
  id: string
  inboxId: string
  workspaceId: string
  ownerId: string
}

class IntegrationApiService {
  async connect(
    input: ConnectIntegrationApiInput,
  ): Promise<{ workspaceId: string; inbox: IntegrationApiModel }> {
    return await db.transaction(async (tx) => {
      const workspaceId =
        input.workspaceId ?? (await input.createWorkspace?.(tx))
      if (!workspaceId) {
        throw new Error(
          "integrationApiService.connect: workspaceId or createWorkspace is required",
        )
      }

      const apiId = createId()

      const { integration } = await connectChannelIntegration({
        tx,
        ownerId: input.ownerId,
        inboxData: {
          id: apiId,
          workspaceId,
          name: input.name,
          channel: integrationTypes.enum.api,
          sourceId: apiId,
        },
        insertIntegration: (inboxId) =>
          integrationApiRepository.insert(
            {
              id: apiId,
              inboxId,
              workspaceId,
              name: input.name,
              auth: input.auth,
              tokenHash: input.tokenHash,
              tokenPrefix: input.tokenPrefix,
              callbackUrl: input.callbackUrl,
            },
            tx,
          ),
      })

      return { workspaceId, inbox: integration }
    })
  }

  async disconnect(input: DisconnectIntegrationApiInput): Promise<void> {
    await db.transaction(async (tx) => {
      await integrationApiRepository.deleteById(input.id, tx)
      await inboxService.disconnect({
        inboxId: input.inboxId,
        ownerId: input.ownerId,
        workspaceId: input.workspaceId,
        tx,
      })
    })
  }
}

export const integrationApiService = new IntegrationApiService()
