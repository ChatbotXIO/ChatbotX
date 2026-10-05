import { integrationThreadsService } from "@chatbotx.io/business"
import {
  buildThreadsAuthValue,
  getThreadsProfile,
} from "@chatbotx.io/integration-threads"
import type { ReconnectResult } from "@/lib/channel-reconnect"
import { logger } from "@/lib/log"

/**
 * Complete an OAuth reconnect for a Threads integration. The freshly
 * authorized account must be the one already stored (matched by
 * `threadsUserId` — never by anything from OAuth state), otherwise a user who
 * signs in with a different Threads account would overwrite this row's token
 * while its webhooks keep arriving for the original account.
 *
 * Mirrors `reconnectInstagramHandler`: returns a result instead of redirecting
 * so the try/catch can never swallow the callback's NEXT_REDIRECT.
 */
export async function reconnectThreadsHandler(props: {
  credentialConfig: { clientId: string; clientSecret: string; version: string }
  callbackUrl: string
  workspaceId: string
  integrationId: string
  accessToken: string
  expiresAt?: string
}): Promise<ReconnectResult> {
  const integrationThreads =
    await integrationThreadsService.findByIdForWorkspace({
      id: props.integrationId,
      workspaceId: props.workspaceId,
    })
  if (!integrationThreads) {
    return { status: "error", reason: "notFound" }
  }

  try {
    const profile = await getThreadsProfile(
      props.accessToken,
      props.credentialConfig.version,
    )
    if (profile.id !== integrationThreads.threadsUserId) {
      return { status: "error", reason: "accountNotFound" }
    }

    const auth = buildThreadsAuthValue({
      clientId: props.credentialConfig.clientId,
      clientSecret: props.credentialConfig.clientSecret,
      redirectUrl: props.callbackUrl,
      version: props.credentialConfig.version,
      accessToken: props.accessToken,
      expiresAt: props.expiresAt,
      threadsUserId: profile.id,
      username: profile.username,
    })

    const updated = await integrationThreadsService.reconnect({
      workspaceId: props.workspaceId,
      id: integrationThreads.id,
      auth,
      username: profile.username,
      name: profile.username,
    })
    if (!updated) {
      return { status: "error", reason: "notFound" }
    }

    return { status: "success" }
  } catch (error) {
    logger.error({ err: error }, "Failed to reconnect Threads integration")
    return { status: "error", reason: "failed" }
  }
}
