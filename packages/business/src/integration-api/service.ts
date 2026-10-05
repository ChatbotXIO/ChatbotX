import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { integrationApiRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationApiModel } from "@chatbotx.io/database/types"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { BaseService } from "../base.service"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import { connectionStateService } from "../connection/state-service"
import { inboxService } from "../inbox/service"

type ConnectIntegrationApiInput = {
  ownerId: string
  actorUserId: string
  workspaceId?: string
  name: string
  auth: AuthValue
  tokenHash: string
  tokenPrefix: string
  callbackUrl: string | null
  createWorkspace?: (tx: DatabaseClient) => Promise<string>
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
    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }
    const result = await withQuotaCompensation(
      {
        ownerId: input.ownerId,
        quotaConsumption,
        context: { provider: "api", actorUserId: input.actorUserId },
      },
      () =>
        db.transaction(async (tx) => {
          const workspaceCreated = !input.workspaceId
          const workspaceId =
            input.workspaceId ?? (await input.createWorkspace?.(tx))
          if (!workspaceId) {
            throw new Error(
              "integrationApiService.connect: workspaceId or createWorkspace is required",
            )
          }

          const apiId = createId()
          const { inbox } = await inboxService.create({
            tx,
            ownerId: input.ownerId,
            data: {
              id: apiId,
              workspaceId,
              name: input.name,
              channel: integrationTypes.enum.api,
              sourceId: apiId,
            },
            skipQuota: true,
          })

          // `id === inboxId === sourceId` — the API binding's
          // `identityColumn: "id"` (`store-bindings.ts`) sets `IntegrationApi
          // .id` to this same `apiId` on insert, preserving the one-id-for-
          // everything convention `connectChannelIntegration` used to encode
          // via its own explicit `inboxData.id` + `insertIntegration({id:
          // apiId, ...})` pair.
          await upsertConnectionRow({
            tx,
            workspaceId,
            provider: "api",
            kind: "channel",
            descriptor: { sourceId: apiId, displayName: input.name },
            auth: input.auth,
            extraConfig: {
              tokenHash: input.tokenHash,
              tokenPrefix: input.tokenPrefix,
              callbackUrl: input.callbackUrl,
            },
            existing: undefined,
            store: CONNECTION_STORE_BINDINGS.api as NonNullable<
              (typeof CONNECTION_STORE_BINDINGS)["api"]
            >,
            ownerId: input.ownerId,
            quotaConsumption,
            actorUserId: input.actorUserId,
            inboxId: inbox.id,
          })

          const integration = await integrationApiRepository.findByInboxId(
            inbox.id,
            tx,
          )
          if (!integration) {
            throw new Error(
              `integrationApiService.connect: IntegrationApi row missing for inbox ${inbox.id}`,
            )
          }

          return { workspaceId, inbox: integration, workspaceCreated }
        }),
    )

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
      await connectionStateService.disconnectInbox({
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
