import {
  connectionStateService,
  customDomainService,
  platformCredentialService,
  tenantService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { IntegrationNotFoundError } from "@chatbotx.io/channel-registry/errors"
import { integrationService } from "@chatbotx.io/channel-registry/registry"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { getSafeErrorDetails } from "@chatbotx.io/integration-threads"
import type {
  TiktokAuthValue,
  TiktokConfig,
} from "@chatbotx.io/integration-tiktok"
import { type ContextQueue, SdkException } from "@chatbotx.io/sdk"
import { integrationQueue } from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import { isCloud } from "@/env"
import { findIntegrationTelegramByBotId } from "@/features/integration-telegram/queries"
import { findIntegrationTiktokByOpenId } from "@/features/integration-tiktok/queries"
import { type IntegrationKey, integrations } from "@/integration"
import { logger } from "@/lib/log"
import { isBrokerHost } from "@/lib/oauth-broker"
import { logWebhookRequestBody } from "@/lib/webhook-log"

type CredentialType = Parameters<
  typeof platformCredentialService.resolveForOwner
>[0]["type"]

type IntegrationWebhookPayload = {
  data: {
    integrationIdentifier: string
    integrationType: string
  }
}

const isIntegrationWebhookPayload = (
  payload: unknown,
): payload is Required<IntegrationWebhookPayload> =>
  typeof payload === "object" &&
  payload !== null &&
  "data" in payload &&
  typeof payload.data === "object" &&
  payload.data !== null &&
  "integrationIdentifier" in payload.data &&
  typeof payload.data.integrationIdentifier === "string" &&
  "integrationType" in payload.data &&
  typeof payload.data.integrationType === "string"

const normalizeCredentialScopedWebhookUrl = (
  url: string,
  credentialId?: string,
): string => {
  if (!credentialId) {
    return url
  }

  const webhookUrl = new URL(url)
  webhookUrl.pathname =
    webhookUrl.pathname.split("/").slice(0, -2).join("/") || "/"
  return webhookUrl.toString()
}

const normalizeCredentialScopedWebhookRequest = (
  req: NextRequest,
  credentialId?: string,
): Request =>
  credentialId
    ? new Request(
        normalizeCredentialScopedWebhookUrl(req.url, credentialId),
        req,
      )
    : req

const createCredentialScopedQueue = (ownerId: string): ContextQueue => ({
  add: async (name, payload, options) => {
    if (!isIntegrationWebhookPayload(payload)) {
      logger.warn(
        { name, ownerId },
        "Ignoring credential-scoped webhook job without ownership routing fields",
      )
      return
    }

    const { integrationIdentifier, integrationType } = payload.data
    try {
      const { inbox } =
        await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
          integrationType as IntegrationType,
          integrationIdentifier,
        )
      const inboxOwnerId =
        await workspaceMemberService.findOwnerUserIdByWorkspaceId({
          workspaceId: inbox.workspaceId,
        })

      if (inboxOwnerId !== ownerId) {
        logger.warn(
          { integrationIdentifier, integrationType, ownerId },
          "Ignoring credential-scoped webhook for another owner's inbox",
        )
        return
      }
    } catch (err) {
      if (!(err instanceof IntegrationNotFoundError)) {
        throw err
      }
      logger.warn(
        { err, integrationIdentifier, integrationType, ownerId },
        "Ignoring credential-scoped webhook for an unresolved inbox",
      )
      return
    }

    return await (integrationQueue as unknown as ContextQueue).add(
      name,
      payload,
      options,
    )
  },
})
const WEBHOOK_PUBLIC_ERROR_HEADERS = {
  "Content-Type": "application/json",
} as const

const THREADS_BAD_REQUEST_MESSAGES = new Set([
  "Empty webhook payload",
  "Invalid webhook signature",
  "Invalid webhook verification parameters",
  "Missing webhook signature",
  "Webhook app_id does not match configured clientId",
])

const createThreadsErrorResponse = (error: unknown) => {
  const safeError = getSafeErrorDetails(error)

  let status = safeError.httpStatusCode

  if (status === undefined) {
    if (safeError.message.startsWith("Unsupported HTTP method:")) {
      status = 405
    } else if (THREADS_BAD_REQUEST_MESSAGES.has(safeError.message)) {
      status = 400
    } else {
      status = 500
    }
  }

  if (status < 400 || status > 599) {
    status = 500
  }

  const isClientError = status >= 400 && status < 500
  return {
    publicMessage: isClientError
      ? "Invalid Threads webhook request"
      : "Failed to process Threads webhook",
    safeError,
    status,
  }
}

const notConfigured = () =>
  new Response(JSON.stringify({ message: "Integration is not configured" }), {
    status: 404,
    headers: WEBHOOK_PUBLIC_ERROR_HEADERS,
  })

export const handleWebhook = async (
  integrationType: string,
  req: NextRequest,
  credentialId?: string,
) => {
  if (integrationType === "threads") {
    return credentialId ? notConfigured() : handleThreadsWebhook(req)
  }

  await logWebhookRequestBody(integrationType, req)

  // Telegram uses per-bot config (not org-level settings)
  if (integrationType === "telegram") {
    return handleTelegramWebhook(req)
  }

  // TikTok uses per-account config (not org-level settings).
  // A credential-scoped route additionally proves the addressed credential
  // belongs to the account receiving the event.
  if (integrationType === "tiktok") {
    return handleTiktokWebhook(req, credentialId)
  }

  const type = integrationType as CredentialType

  let credential:
    | Awaited<
        ReturnType<typeof platformCredentialService.findDecryptedPlatform>
      >
    | undefined
  let credentialOwnerId: string | undefined

  if (credentialId) {
    if (!isCloud()) {
      return notConfigured()
    }
    credential = await platformCredentialService.findDecryptedForWebhook({
      id: credentialId,
      type,
    })
    credentialOwnerId = credential?.userId ?? undefined
    if (!credentialOwnerId) {
      return notConfigured()
    }
  } else if (isCloud()) {
    const domain = req.headers.get("x-domain") ?? ""

    if (isBrokerHost(domain)) {
      // Broker (platform) domain: use global platform credential
      credential = await platformCredentialService.findDecryptedPlatform({
        type,
      })
    } else {
      // Custom domain: tenant-specific lookup
      const customDomain = domain
        ? await customDomainService.findActiveByDomain(domain)
        : undefined

      if (!customDomain) {
        logger.debug(
          { integrationType, domain },
          "No active custom domain for integration webhook",
        )
        return notConfigured()
      }

      const tenant = await tenantService.findById(customDomain.tenantId)
      if (!tenant?.ownerId || tenant.status !== "active") {
        logger.debug(
          { integrationType, domain },
          "Tenant disabled for integration webhook",
        )
        return notConfigured()
      }

      // Tenant's own credential — no fallback to global platform
      credential = await platformCredentialService.findDecryptedForUser({
        userId: tenant.ownerId,
        type,
      })
    }
  } else {
    // Non-cloud (OSS/enterprise): single-tenant, always use global platform credential
    credential = await platformCredentialService.findDecryptedPlatform({ type })
  }

  if (!credential) {
    logger.debug(`Integration ${integrationType} is not configured`)
    return notConfigured()
  }

  const integration = integrations[integrationType as IntegrationKey]
  if (!integration?.handleRequest) {
    return new Response(
      JSON.stringify({ message: "Method is not implemented" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  const redirectUrl = new URL(
    `/integrations/${integration.name}/callback`,
    req.nextUrl,
  ).toString()

  const settings = credential.config

  try {
    const result = await integration.handleRequest({
      config: {
        ...settings,
        redirectUrl,
        stateParams: {
          workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
          referer: req.nextUrl.toString(),
        },
        // biome-ignore lint/suspicious/noExplicitAny: safe pass value
      } as any,
      req: normalizeCredentialScopedWebhookRequest(req, credentialId),
      queue: credentialOwnerId
        ? createCredentialScopedQueue(credentialOwnerId)
        : integrationQueue,
    })

    return new Response(result as BodyInit)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error(
      { err: e, integrationType },
      "Integration handleRequest failed",
    )
    // Respect the exception's own status (e.g. 401 from a failed inbound
    // webhook signature check) instead of always answering 400 — every
    // SdkException still defaults its httpStatusCode to 400, so this is a
    // no-op for exceptions that never set one.
    const status = e instanceof SdkException ? e.httpStatusCode : 400
    return new Response(JSON.stringify({ message }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }
}

const handleThreadsWebhook = async (req: NextRequest) => {
  const appId = req.nextUrl.searchParams.get("appId")?.trim()

  if (!appId) {
    return notConfigured()
  }

  const integration = integrations.threads
  if (!integration?.handleRequest) {
    return new Response(
      JSON.stringify({ message: "Method is not implemented" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const credential =
    await platformCredentialService.findDecryptedThreadsByClientId({
      clientId: appId,
    })

  if (!credential) {
    logger.debug(
      { appId, integrationType: "threads" },
      "No configured Threads credential for webhook appId",
    )
    return notConfigured()
  }

  const redirectUrl = new URL(
    `/integrations/${integration.name}/callback`,
    req.nextUrl,
  ).toString()

  try {
    const result = await integration.handleRequest({
      config: {
        ...credential.config,
        redirectUrl,
        stateParams: {
          workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
          referer: req.nextUrl.toString(),
        },
        // biome-ignore lint/suspicious/noExplicitAny: safe pass value
      } as any,
      req,
      queue: credential.userId
        ? createCredentialScopedQueue(credential.userId)
        : integrationQueue,
    })

    return new Response(result as BodyInit)
  } catch (e: unknown) {
    const { publicMessage, safeError, status } = createThreadsErrorResponse(e)
    logger.error(
      {
        error: safeError,
        integrationType: "threads",
        status,
      },
      "Threads handleRequest failed",
    )
    return new Response(JSON.stringify({ message: publicMessage }), {
      status,
      headers: WEBHOOK_PUBLIC_ERROR_HEADERS,
    })
  }
}

const handleTelegramWebhook = async (req: NextRequest) => {
  const botId = req.nextUrl.searchParams.get("botId")
  if (!botId) {
    return new Response(
      JSON.stringify({ message: "Missing botId query param" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const integration = integrations.telegram
  if (!integration?.handleRequest) {
    return new Response(
      JSON.stringify({ message: "Method is not implemented" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const integrationTelegram = await findIntegrationTelegramByBotId({ botId })
  if (!integrationTelegram) {
    return new Response(JSON.stringify({ message: "Bot not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const auth = integrationTelegram.auth as {
    secretText: string
    metadata?: { botId?: string; webhookSecretToken?: string }
  }

  try {
    const result = await integration.handleRequest({
      config: {
        botId: integrationTelegram.botId,
        webhookSecretToken: auth.metadata?.webhookSecretToken,
        // biome-ignore lint/suspicious/noExplicitAny: safe pass value
      } as any,
      req,
      queue: integrationQueue,
    })

    return new Response(result as BodyInit)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error(
      { err: e, integrationType: "telegram" },
      "Telegram handleRequest failed",
    )
    return new Response(JSON.stringify({ message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
}

const handleTiktokWebhook = async (req: NextRequest, credentialId?: string) => {
  let credentialOwnerId: string | undefined
  if (credentialId) {
    if (!isCloud()) {
      return notConfigured()
    }
    const credential = await platformCredentialService.findDecryptedForWebhook({
      id: credentialId,
      type: "tiktok",
    })
    credentialOwnerId = credential?.userId ?? undefined
    if (!credentialOwnerId) {
      return notConfigured()
    }
  }

  const integration = integrations.tiktok
  if (!integration?.handleRequest) {
    return new Response(
      JSON.stringify({ message: "Method is not implemented" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const bodyText = await req.text()
  if (!bodyText) {
    return new Response(JSON.stringify({ message: "Empty webhook payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  let userOpenId: string | undefined
  let eventType: string | undefined
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>
    userOpenId =
      typeof parsed.user_openid === "string" ? parsed.user_openid : undefined
    eventType = typeof parsed.event === "string" ? parsed.event : undefined
  } catch {
    // Invalid JSON — the integration handler returns the detailed error.
  }

  if (!userOpenId) {
    return new Response(
      JSON.stringify({ message: "Missing user_openid in payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const integrationTiktok = await findIntegrationTiktokByOpenId({
    openId: userOpenId,
  })
  if (!integrationTiktok) {
    return new Response(
      JSON.stringify({ message: "TikTok account not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  const workspaceOwnerId =
    await workspaceMemberService.findOwnerUserIdByWorkspaceId({
      workspaceId: integrationTiktok.workspaceId,
    })
  if (credentialOwnerId && workspaceOwnerId !== credentialOwnerId) {
    logger.warn(
      {
        credentialOwnerId,
        openId: userOpenId,
        workspaceId: integrationTiktok.workspaceId,
      },
      "Ignoring credential-scoped TikTok webhook for another owner's inbox",
    )
    return notConfigured()
  }

  if (eventType === "authorization.removed") {
    const connection = await connectionStateService.markUnhealthyByIdentifier({
      provider: "tiktok",
      identifier: userOpenId,
      reason: "token_revoked",
      ownerId: workspaceOwnerId,
      workspaceId: integrationTiktok.workspaceId,
    })
    if (!connection) {
      // No `Connection` row yet for this provider/workspace — the inbox
      // predates the TikTok backfill. Mirror the legacy "set status
      // disconnected" behavior directly on the `Inbox` row so a
      // revoked-token inbox doesn't silently stay `connected`; never
      // `inboxService.disconnect`, which also releases `channels` quota
      // this un-backfilled row was never counted against.
      await connectionStateService.markLegacyInboxUnhealthy({
        inboxId: integrationTiktok.inboxId,
        workspaceId: integrationTiktok.workspaceId,
        reason: "token_revoked",
      })
      logger.info(
        { openId: userOpenId, workspaceId: integrationTiktok.workspaceId },
        "TikTok authorization removed — no Connection row; marked legacy inbox unhealthy",
      )
      return new Response("ok")
    }
    logger.info(
      { openId: userOpenId },
      "TikTok authorization removed — connection marked unhealthy",
    )
    return new Response("ok")
  }

  const auth = integrationTiktok.auth as TiktokAuthValue

  // Reconstruct request because req.text() already consumed the body.
  const reqWithBody = new Request(
    normalizeCredentialScopedWebhookUrl(req.url, credentialId),
    {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    },
  )

  const tiktokConfig: TiktokConfig = {
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    redirectUrl: auth.redirectUrl,
    openId: integrationTiktok.openId,
  }

  try {
    const result = await integration.handleRequest({
      config: tiktokConfig,
      req: reqWithBody,
      queue: integrationQueue,
    })

    return new Response(result as BodyInit)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error(
      { err: e, integrationType: "tiktok" },
      "TikTok handleRequest failed",
    )
    return new Response(JSON.stringify({ message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
}
