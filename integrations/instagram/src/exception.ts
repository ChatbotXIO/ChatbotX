import { SdkException } from "@chatbotx.io/sdk"

export class InstagramException extends SdkException {}

export class InstagramAttachmentException extends InstagramException {
  readonly attachmentUrl?: string

  constructor(message: string, attachmentUrl?: string) {
    super(`Attachment error: ${message}`)
    this.attachmentUrl = attachmentUrl
  }
}

export class InstagramWebhookException extends InstagramException {
  readonly webhookData?: unknown

  constructor(message: string, webhookData?: unknown) {
    super(`Webhook error: ${message}`)
    this.webhookData = webhookData
  }
}

export class InstagramAPIException extends InstagramException {
  readonly apiEndpoint?: string

  constructor(message: string, apiEndpoint?: string) {
    super(`API error: ${message}`)
    this.apiEndpoint = apiEndpoint
  }
}
