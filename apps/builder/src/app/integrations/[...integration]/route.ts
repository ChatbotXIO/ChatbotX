import type { IntegrationType } from "@chatbotx.io/database/partials"
import { HandleRequestType } from "@chatbotx.io/sdk"
import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { toCamelCase } from "remeda"
import { handleCallback } from "./callback"
import { handleWebhook } from "./webhook"

const handleRequest = async (
  req: NextRequest,
  { params }: { params: Promise<{ integration: string[] }> },
) => {
  const allParams = await params
  const integrationType = toCamelCase(
    allParams.integration[0],
  ) as IntegrationType
  const integrationAction = allParams.integration[1]

  if (!(integrationType && integrationAction)) {
    return notFound()
  }

  switch (integrationAction) {
    case HandleRequestType.callback:
      return await handleCallback(integrationType, req)
    case HandleRequestType.webhook: {
      const credentialId =
        allParams.integration[2] === "c" ? allParams.integration[3] : undefined
      if (allParams.integration.length > 2 && !credentialId) {
        return notFound()
      }
      return await handleWebhook(integrationType, req, credentialId)
    }
    default:
      return notFound()
  }
}

export const GET = handleRequest
export const POST = handleRequest
