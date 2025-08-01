import {
  type BaseConfig,
  Integration,
  type IntegrationDefinition,
} from "@aha.chat/sdk"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import type { OpenAIActions, OpenAIAuthValue } from "./schemas"

const config: IntegrationDefinition<
  BaseConfig,
  OpenAIAuthValue,
  OpenAIActions
> = {
  name: "openAI",
  actions: {
    generateText: async ({ ctx, props }): Promise<string> => {
      const openai = createOpenAI({
        apiKey: ctx.auth.secretText,
      })

      const { text } = await generateText({
        model: openai(props.model),
        prompt: props.prompt,
        messages: [
          {
            role: "user",
            content: props.userMessage,
          },
        ],
      })

      return text
    },
  },
}

export const integration = new Integration(config)
