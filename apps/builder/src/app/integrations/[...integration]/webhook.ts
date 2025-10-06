import type { OrganizationSettings } from "@aha.chat/database/types"
import { integrationQueue } from "@aha.chat/worker-config"
import type { NextRequest } from "next/server"
import { findOrganization } from "@/features/organization/queries"
import { type IntegrationKey, integrations } from "@/integration"

export const handleWebhook = async (
  integrationName: string,
  req: NextRequest,
) => {
  const organization = await findOrganization({
    domain: req.nextUrl.hostname,
  })
  const organizationSettings =
    organization?.settings as unknown as OrganizationSettings

  const integration = integrations[integrationName as IntegrationKey]
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

  const settings =
    organizationSettings[integration.name as keyof OrganizationSettings]

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
