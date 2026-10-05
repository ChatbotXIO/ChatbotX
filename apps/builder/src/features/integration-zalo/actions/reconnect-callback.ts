import {
  connectionStateService,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import { authExpiresAtOf } from "@chatbotx.io/business/connection"
import { db } from "@chatbotx.io/database/client"
import type { ZaloCredential } from "@chatbotx.io/database/partials"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { integrations } from "@/integration"
import type { ReconnectResult } from "@/lib/channel-reconnect"
import { logger } from "@/lib/log"

/**
 * Complete an OAuth reconnect for an existing Zalo OA integration: the user
 * re-authorized the Zalo app, so exchange the code for fresh tokens, verify
 * the freshly authorized OA against the stored row (matched by the stored
 * `oaId` — never by anything from OAuth state) and store the fresh auth.
 */
export async function reconnectZaloHandler(props: {
  zaloSettings: ZaloCredential
  workspaceId: string
  integrationId: string
  req: Request
  callbackUrl: string
}): Promise<ReconnectResult> {
  const integrationZalo = await zaloIntegrationService
    .findById({ id: props.integrationId, workspaceId: props.workspaceId })
    .catch(() => null)
  if (!integrationZalo) {
    return { status: "error", reason: "notFound" }
  }

  try {
    const authValue = (await integrations.zalo.handleRequest({
      config: {
        ...props.zaloSettings,
        // Must match the redirect_uri used at authorize time — the tenant's
        // custom domain for a tenant-owned credential, else the broker — even
        // though this handler runs on the originating host after the relay.
        // See `libs/zalo.ts` and `oauth-referer.ts`.
        redirectUrl: props.callbackUrl,
        stateParams: { workspaceId: props.workspaceId },
      },
      req: props.req,
    })) as ZaloAuthValue

    if (authValue.oaId !== integrationZalo.oaId) {
      return { status: "error", reason: "accountNotFound" }
    }

    // Both writes share one transaction so a failure inside `reconnectInbox`
    // (e.g. a channel-limit re-check) rolls back the auth write too, instead
    // of leaving the satellite row re-authorized while the Connection/Inbox
    // state stays stale.
    await db.transaction(async (tx) => {
      await zaloIntegrationService.updateAuth(
        integrationZalo.id,
        authValue,
        authValue.metadata.oaName,
        tx,
      )

      await connectionStateService.reconnectInbox({
        inboxId: integrationZalo.inboxId,
        workspaceId: props.workspaceId,
        authExpiresAt: authExpiresAtOf(authValue),
        tx,
      })
    })

    return { status: "success" }
  } catch (error) {
    logger.error({ err: error }, "Failed to reconnect Zalo integration")
    return { status: "error", reason: "failed" }
  }
}
