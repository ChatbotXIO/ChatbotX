import {
  customDomainService,
  platformCredentialService,
  platformSettingService,
} from "@chatbotx.io/business"
import { integrationQueue } from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import { env, isCloud } from "@/env"
import { findIntegrationTelegramByBotId } from "@/features/integration-telegram/queries"
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

      const platformSetting = await platformSettingService.findForUser(
        customDomain.userId,
      )
      if (!platformSetting?.isEnabled) {
        logger.debug(
          { integrationType, domain },
          "Platform disabled for integration webhook",
        )
        return new Response(
          JSON.stringify({ message: "Integration is not configured" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        )
      }

      // Tenant's own credential — no fallback to global platform
      credential = await platformCredentialService.findDecryptedForUser({
        userId: customDomain.userId,
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
