import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { IntegrationOpenaiCompatibleModel } from "@chatbotx.io/database/types"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"

export function createOpenaiCompatibleModelInstance(props: {
  integration: IntegrationOpenaiCompatibleModel
  modelId: string
}) {
  const { integration, modelId } = props
  const authParsed = secretTextAuthSchema.safeParse(integration.auth)
  const apiKey = authParsed.success ? authParsed.data.secretText : undefined
  const transformRequestBody =
    integration.preset === "nearai"
      ? (body: Record<string, unknown>) => {
          const { reasoning_effort, ...rest } = body
          return rest
        }
      : undefined

  const provider = createOpenAICompatible({
    name: integration.preset || "openai-compatible",
    baseURL: integration.baseURL,
    apiKey,
    ...(transformRequestBody ? { transformRequestBody } : {}),
  })

  return provider(modelId)
}
