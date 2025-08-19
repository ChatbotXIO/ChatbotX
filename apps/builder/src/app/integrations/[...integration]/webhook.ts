import type { OrganizationSettings } from "@aha.chat/database/types"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integrationQueue } from "@aha.chat/worker-config"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { findOrganization } from "@/features/organization/queries"
import { type IntegrationKey, integrations } from "@/integration"

export const handleWebhook = async (integrationName: string, req: Request) => {
  const headersList = await headers()
  const url = new URL(headersList.get("x-url") ?? "")

  const organization = await findOrganization({
    domain: url.hostname,
  })
  const organizationSettings =
    organization?.settings as unknown as OrganizationSettings

  const integration =
    integrations[integrationName as IntegrationKey].integration
  if (!integration?.handleRequest) {
    return new Response(
      JSON.stringify({ message: "Method is not implemented" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  try {
    switch (integration.name) {
      case "whatsapp": {
        const result = await integrationWhatsapp.handleRequest({
          config: {
            appSecret: organizationSettings.whatsappClientSecret,
            webhookVerifyToken: organizationSettings.whatsappVerifyToken,
          },
          req,
          queue: integrationQueue,
        })
        return new Response(result as BodyInit)
      }

      default: {
        return notFound()
      }
    }
  } catch (e: unknown) {
    return new Response(JSON.stringify({ message: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
}
