import {
  type OrganizationSettings,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { integrationQueue } from "@aha.chat/worker-config"
import type { NextRequest } from "next/server"
import { findOrganization } from "@/features/organization/queries"
import { type IntegrationKey, integrations } from "@/integration"
import { getDomainFromHeader } from "@/lib/domain"
import { logger } from "@/lib/log"

export const handleWebhook = async (
  integrationType: string,
  req: NextRequest,
) => {
  const domain = await getDomainFromHeader()
  const organization = await findOrganization({
    domain,
  })
  if (!organization) {
    return new Response(JSON.stringify({ message: "Organization not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

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
      JSON.stringify({ message: "Integration is not configured" }),
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
          chatbotId: req.nextUrl.searchParams.get("chatbotId") ?? "",
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
