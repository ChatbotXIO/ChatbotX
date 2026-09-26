import type { IntegrationType } from "@chatbotx.io/database/partials"

export class IntegrationNotFoundError extends Error {
  readonly channel: IntegrationType
  readonly identifier: string

  constructor(channel: IntegrationType, identifier: string) {
    super(`Integration not found: ${channel} ${identifier}`)
    this.name = "IntegrationNotFoundError"
    this.channel = channel
    this.identifier = identifier
  }
}
