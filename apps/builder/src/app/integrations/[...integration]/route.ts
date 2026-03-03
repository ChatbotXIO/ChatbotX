import type { IntegrationType } from "@aha.chat/database/types"
import { HandleRequestType } from "@aha.chat/sdk"
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
    case HandleRequestType.webhook:
      return await handleWebhook(integrationType, req)
    default:
      return notFound()
  }
}

export const GET = handleRequest
export const POST = handleRequest
