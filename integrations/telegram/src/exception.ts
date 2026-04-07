import { SdkException } from "@chatbotx.io/sdk"

export class TelegramException extends SdkException {}

export class TelegramWebhookException extends TelegramException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class TelegramAPIException extends TelegramException {
  readonly apiEndpoint?: string

  constructor(message: string, apiEndpoint?: string) {
    super(`API error: ${message}`)
    this.apiEndpoint = apiEndpoint
  }
}
