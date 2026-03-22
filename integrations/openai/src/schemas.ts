import type { Context, Handler, SecretTextAuthValue } from "@aha.chat/sdk"

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
