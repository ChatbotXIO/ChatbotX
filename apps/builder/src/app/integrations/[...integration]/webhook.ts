import {
  type OrganizationSettings,
  organizationSettingsSchema,
} from "@chatbotx.io/database/partials"
import { integrationQueue } from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import { findIntegrationTelegramByBotId } from "@/features/integration-telegram/queries"
import { organizationService } from "@/features/organization/services"
import { type IntegrationKey, integrations } from "@/integration"
import { getDomainFromHeader } from "@/lib/domain"
import { logger } from "@/lib/log"

export const handleWebhook = async (
  integrationType: string,
  req: NextRequest,
) => {
  // Telegram uses per-bot config (not org-level settings)
  if (integrationType === "telegram") {
    return handleTelegramWebhook(req)
  }

  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)

  // Verify organization settings
  const orgSettings = organizationSettingsSchema.parse(organization?.settings)
  if (!orgSettings?.[integrationType as keyof OrganizationSettings]) {
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

  const settings = orgSettings[integration.name as keyof OrganizationSettings]

  if (!settings) {
    return new Response(
      JSON.stringify({
        message: `Integration ${integration.name} is not configured`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

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
    return new Response(JSON.stringify({ message: (e as Error).message }), {
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
    return new Response(JSON.stringify({ message: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
}
