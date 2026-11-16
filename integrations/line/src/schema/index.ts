import type { BaseConfig, Oauth2AuthValue } from "@chatbotx.io/sdk"

/**
 * `clientId` is the LINE Channel ID and `clientSecret` the Channel secret.
 * `redirectUrl` is always `""` (required by the schema, unused).
 */
export type LineAuthValue = Oauth2AuthValue & {
  metadata: { botUserId: string; basicId: string }
}

export type LineConfig = BaseConfig & {
  channelId: string
  channelSecret: string
  botUserId: string
}

export type LineBotInfo = {
  userId: string
  basicId: string
  displayName: string
  pictureUrl?: string
}

export type LineWebhookEndpoint = {
  endpoint: string
  active: boolean
}

export type LineWebhookTestResult = {
  success: boolean
  reason?: string
  detail?: string
}

export type LineTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
}

export type LineActions = {
  connect: (props: { channelId: string; channelSecret: string }) => Promise<{
    auth: LineAuthValue
    bot: LineBotInfo
  }>
  registerWebhook: (props: {
    auth: LineAuthValue
    webhookUrl: string
  }) => Promise<{ previousWebhookUrl: string | null }>
  /**
   * Webhook health: LINE's webhook test plus the console's "Use webhook"
   * toggle (`active`). Never throws; failures become `success: false`.
   */
  testWebhook: (props: { auth: LineAuthValue }) => Promise<{
    success: boolean
    reason?: string
    active: boolean
  }>
}
