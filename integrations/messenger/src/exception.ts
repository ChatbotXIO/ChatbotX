import { MessengerSdkException } from "@chatbotx.io/sdk"

export class MessengerException extends MessengerSdkException {}

export class MessengerAttachmentException extends MessengerException {
  readonly attachmentUrl?: string

  constructor(message: string, attachmentUrl?: string) {
    super(`Attachment error: ${message}`)
    this.attachmentUrl = attachmentUrl
  }
}

export class MessengerWebhookException extends MessengerException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class MessengerAPIException extends MessengerException {
  readonly apiEndpoint?: string

  constructor(message: string, apiEndpoint?: string) {
    super(`API error: ${message}`)
    this.apiEndpoint = apiEndpoint
  }
}
