import { HandleRequestType } from "@ahachat.ai/sdk"
import { notFound } from "next/navigation"
import { handleCallback } from "./callback"
import { handleWebhook } from "./webhook"

const handleRequest = async (
  req: Request,
  { params }: { params: Promise<{ integration: string[] }> },
) => {
  const allParams = await params
  let integrationName = allParams.integration[0]
  const interationAction = allParams.integration[1]

  if (!integrationName) {
    return notFound()
  }

  integrationName = integrationName.replace(/-/g, "_").toUpperCase()

  switch (interationAction) {
    case HandleRequestType.CALLBACK:
      return await handleCallback(integrationName, req)
    case HandleRequestType.WEBHOOK:
      return await handleWebhook(integrationName, req)
    default:
      return notFound()
  }
}

export const GET = handleRequest
export const POST = handleRequest
