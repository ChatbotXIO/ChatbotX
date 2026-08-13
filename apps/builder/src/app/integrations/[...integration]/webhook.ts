import {
  customDomainService,
  platformCredentialService,
  resolveWorkspaceFreezeReason,
  tenantService,
  userQuotaService,
  workspaceService,
} from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  TiktokAuthValue,
  TiktokConfig,
} from "@chatbotx.io/integration-tiktok"
import { integrationQueue } from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import { isCloud } from "@/env"
import { findIntegrationTelegramByBotId } from "@/features/integration-telegram/queries"
import { findIntegrationTiktokByOpenId } from "@/features/integration-tiktok/queries"
import { type IntegrationKey, integrations } from "@/integration"
import { logger } from "@/lib/log"
import { isBrokerHost } from "@/lib/oauth-broker"

type CredentialType = Parameters<
  typeof platformCredentialService.resolveForOwner
>[0]["type"]

const logWebhookRequestBody = async (
  integrationType: string,
  req: NextRequest,
) => {
  try {
    const body = await req.clone().text()
    logger.info({ integrationType, body }, "Webhook request body")
  } catch (e: unknown) {
    logger.info(
      { integrationType, err: e },
      "Failed to read webhook request body for logging",
    )
  }
}
/**
 * Per-bot/per-account channels (telegram, tiktok) reach their integration
 * handler before any queue consumer runs, so they need the freeze verdict
 * in-request. Delegating to the shared resolver keeps them aligned with the
 * worker-side guard instead of re-implementing a weaker owner-only check.
 */
const resolveWebhookFreezeReason = async (
  workspaceId: string,
): Promise<ReturnType<typeof resolveWorkspaceFreezeReason>> => {
  const workspace = await workspaceService.find({ where: { id: workspaceId } })

  // Two passes, mirroring withBlockedOwnerGuard: the Workspace row alone
  // decides `missingWorkspace`/`scheduledForDeletion`; only `ownerBlocked`
  // needs entitlements, and only the cloud edition can produce it, so
  // self-hosted installs skip the quota lookup entirely.
  const rowReason = resolveWorkspaceFreezeReason({ workspace })
  if (rowReason || !isCloud() || !workspace) {
    return rowReason
  }

  return resolveWorkspaceFreezeReason({
    accessState: await userQuotaService.getAccessState(workspace.ownerId),
    workspace,
  })
}

export const handleWebhook = async (
  integrationType: string,
  req: NextRequest,
) => {
  await logWebhookRequestBody(integrationType, req)

  // Telegram uses per-bot config (not org-level settings)
  if (integrationType === "telegram") {
    return handleTelegramWebhook(req)
  }

  // TikTok uses per-account config (not org-level settings)
  if (integrationType === "tiktok") {
    return handleTiktokWebhook(req)
  }

  const type = integrationType as CredentialType

  let credential:
    | Awaited<
        ReturnType<typeof platformCredentialService.findDecryptedPlatform>
      >
    | undefined

  if (isCloud()) {
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
        return new Response(
          JSON.stringify({ message: "Integration is not configured" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        )
      }

      const tenant = await tenantService.findById(customDomain.tenantId)
      if (!tenant?.ownerId || tenant.status !== "active") {
        logger.debug(
          { integrationType, domain },
          "Tenant disabled for integration webhook",
        )
        return new Response(
          JSON.stringify({ message: "Integration is not configured" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        )
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
    return new Response(
      JSON.stringify({ message: "Integration is not configured" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    )
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
      req,
      queue: integrationQueue,
    })

    return new Response(result as BodyInit)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error(
      { err: e, integrationType },
      "Integration handleRequest failed",
    )
    return new Response(JSON.stringify({ message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
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

  const telegramFreezeReason = await resolveWebhookFreezeReason(
    integrationTelegram.workspaceId,
  )
  if (telegramFreezeReason) {
    logger.info(
      {
        freezeReason: telegramFreezeReason,
        integrationType: "telegram",
        workspaceId: integrationTelegram.workspaceId,
      },
      "webhook skipped: frozen workspace",
    )
    // 200 so Telegram does not retry or disable the webhook while frozen.
    return new Response("ok")
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

const handleTiktokWebhook = async (req: NextRequest) => {
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
    // invalid JSON — integration handler will return the error
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

  const tiktokFreezeReason = await resolveWebhookFreezeReason(
    integrationTiktok.workspaceId,
  )
  if (tiktokFreezeReason) {
    logger.info(
      {
        freezeReason: tiktokFreezeReason,
        integrationType: "tiktok",
        workspaceId: integrationTiktok.workspaceId,
      },
      "webhook skipped: frozen workspace",
    )
    // 200 so TikTok does not retry or revoke the subscription while frozen.
    return new Response("ok")
  }

  if (eventType === "authorization.removed") {
    await db
      .update(inboxModel)
      .set({ status: inboxStatuses.enum.disconnected })
      .where(eq(inboxModel.id, integrationTiktok.inboxId))
    logger.info(
      { openId: userOpenId },
      "TikTok authorization removed — inbox marked disconnected",
    )
    return new Response("ok")
  }

  const auth = integrationTiktok.auth as TiktokAuthValue

  // Reconstruct request because req.text() already consumed the body
  const reqWithBody = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: bodyText,
  })

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
