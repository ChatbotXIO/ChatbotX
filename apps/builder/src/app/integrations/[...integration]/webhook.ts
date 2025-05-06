import { type IntegrationKey, integrations } from "@/integration"
import { integrationQueue } from "@ahachat.ai/worker-config"
import { notFound } from "next/navigation"
import { IntegrationType } from "@ahachat.ai/database"

export const handleWebhook = async (integrationName: string, req: Request) => {
  const integration =
    integrations[integrationName as IntegrationKey].integration

  if (!integration || !integration?.handleRequest) {
    return new Response(
      JSON.stringify({ message: "Method is not implemented" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  try {
    const integrationNameUpper = integrationName.toUpperCase()

    if (integrationName !== IntegrationType.WHATSAPP) {
      return notFound()
    }
    const result = await integration.handleRequest({
      config: {
        appSecret:
          process.env[`INTEGRATION_${integrationNameUpper}_SECRET`] ?? "",
        webhookVerifyToken:
          process.env.INTEGRATION_VERIFY_TOKEN ?? "ahachat.ai",
        clientId: process.env[`INTEGRATION_${integrationNameUpper}_ID`] ?? "",
        clientSecret:
          process.env[`INTEGRATION_${integrationNameUpper}_SECRET`] ?? "",
        redirectUri: "",
      },
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
