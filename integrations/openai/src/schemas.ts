import type { Context, Handler, SecretTextAuthValue } from "@chatbotx.io/sdk"

export type OpenAIAuthValue = SecretTextAuthValue

export type OpenAIActions = {
  generateText: Handler<
    {
      ctx: Context<OpenAIAuthValue>
      props: { model: string; prompt?: string; userMessage: string }
    },
    unknown
  >
}
