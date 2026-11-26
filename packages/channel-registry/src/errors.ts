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

/**
 * `ChannelError.code` of the error thrown when an inbox has no integration row
 * (never connected, or its credentials were removed). Callers that treat that
 * as "not connected" rather than a failure compare against this constant.
 */
export const INTEGRATION_AUTH_MISSING_CODE = "integration_auth_missing"
