import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
  type SecretTextAuthValue,
} from "@aha.chat/sdk"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import type { OpenAIActions, OpenAIAuthValue } from "./schemas"

const config: IntegrationDefinition<
  BaseConfig,
  OpenAIAuthValue,
  OpenAIActions
> = {
  name: "openai",
  actions: {
    generateText: async ({ ctx, props }): Promise<string> => {
      const openai = createOpenAI({
        apiKey: ctx.auth.secretText,
      })

      const { text } = await generateText({
        model: openai(props.model),
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
  handleRequest(
    _props: HandleRequestProps<BaseConfig>,
  ): Promise<string | number | Oauth2AuthValue> {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: SecretTextAuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
