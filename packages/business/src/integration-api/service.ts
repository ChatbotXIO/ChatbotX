import { db } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { integrationApiRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationApiModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { BaseService } from "../base.service"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"

type ConnectIntegrationApiInput = {
  ownerId: string
  actorUserId: string
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

class IntegrationApiService extends BaseService {
  async connect(
    input: ConnectIntegrationApiInput,
  ): Promise<{ workspaceId: string; inbox: IntegrationApiModel }> {
    const result = await db.transaction(async (tx) => {
      const workspaceCreated = !input.workspaceId
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

      return { workspaceId, inbox: integration, workspaceCreated }
    })

    // Sanctioned exception: `connect()` is reachable from `authActionClient`
    // (create-api.action.ts), which never puts `workspaceId` into the ALS
    // actor — only workspace-scoped action clients do. this.audit() would
    // silently no-op here, so bypass it with an explicit override.
    if (result.workspaceCreated) {
      // Matches the other 5 "connect channel creates a new workspace" flows
      // (WhatsApp/Instagram x2/Messenger/Telegram/Webchat) — API channel is
      // the 6th entry point that can create a workspace on connect.
      await dispatchAuditRecord({
        userId: input.actorUserId,
        workspaceId: result.workspaceId,
        action: "create",
        detail: `created the workspace (#${result.workspaceId})`,
      })
    }
    await dispatchAuditRecord({
      userId: input.actorUserId,
      workspaceId: result.workspaceId,
      action: "create",
      detail: `created a new API key (#${result.inbox.id})`,
    })

    return result
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

    await this.audit("delete", `revoked an API key (#${input.id})`)
  }
}

export const integrationApiService = new IntegrationApiService()
