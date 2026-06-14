import {
  customDomainService,
  platformCredentialService,
  tenantService,
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
import { env, isCloud } from "@/env"
import { findIntegrationTelegramByBotId } from "@/features/integration-telegram/queries"
import { findIntegrationTiktokByOpenId } from "@/features/integration-tiktok/queries"
import { type IntegrationKey, integrations } from "@/integration"
import { logger } from "@/lib/log"

type CredentialType = Parameters<
  typeof platformCredentialService.resolveForOwner
>[0]["type"]

export const handleWebhook = async (
  integrationType: string,
  req: NextRequest,
) => {
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
    const defaultDomain = new URL(env.NEXT_PUBLIC_BUILDER_URL).hostname

    if (domain === defaultDomain) {
      // Default platform domain: use global platform credential
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
