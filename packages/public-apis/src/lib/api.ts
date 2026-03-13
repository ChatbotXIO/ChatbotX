import ky, { type KyInstance } from "ky"
import type { ChatbotXConfig } from "./config"

export type ChatbotXAPIProps = {
  apiKey: string
  apiUrl: string
  allowSelfSignedCert?: boolean
}

export class ChatbotXAPI {
  private static hasWarnedInsecureTls = false
  private readonly apiKey: string
  private readonly apiUrl: string
  private readonly client: KyInstance

  constructor(props: ChatbotXAPIProps) {
    const { apiKey, apiUrl, allowSelfSignedCert } = props
    this.apiKey = apiKey
    this.apiUrl = apiUrl

    if (allowSelfSignedCert) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

      if (!ChatbotXAPI.hasWarnedInsecureTls) {
        process.stderr.write(
          "Warning: TLS certificate verification is disabled (CHATBOTX_ALLOW_SELF_SIGNED_CERT=true). Use only in local development.\n",
        )
        ChatbotXAPI.hasWarnedInsecureTls = true
      }
    }

    this.client = ky.create({
      prefixUrl: new URL("/api/v1", this.apiUrl).toString(),
      // throwHttpErrors: false,
      headers: {
        "Content-Type": "application/json",
        "X-CHATBOT-TOKEN": this.apiKey,
      },
    })
  }

  getClient(): KyInstance {
    return this.client
  }
}

export const createChatbotXAPI = (config: ChatbotXConfig): ChatbotXAPI => {
  return new ChatbotXAPI(config)
}
