import { assertPublicUrl } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"
import type { WebhookPayload, WebhookWithConditions } from "../types"

/**
 * Delivers an already-built payload to one webhook endpoint, with connection
 * retries. Building the payload is `buildWebhookPayload`'s job — keeping the two
 * apart is what lets one payload serve a whole fan-out, and it leaves a single
 * source of truth for what gets sent.
 */
export class WebhookExecutor {
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 1000

  private isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    const message = error.message.toLowerCase()
    const connectionErrors = [
      "econnrefused",
      "enotfound",
      "econnreset",
      "enetunreach",
      "ehostunreach",
    ]

    return connectionErrors.some((err) => message.includes(err))
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async executeRequest(
    url: string,
    payload: WebhookPayload,
  ): Promise<Response> {
    await assertPublicUrl(url, "Webhook URL")

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AhaChat-Webhook/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
  }

  private async attemptRequest(
    webhook: WebhookWithConditions,
    payload: WebhookPayload,
    attempt: number,
  ): Promise<boolean> {
    try {
      const response = await this.executeRequest(webhook.url, payload)

      if (!response.ok) {
        logger.warn(
          {
            webhookId: webhook.id,
            url: webhook.url,
            status: response.status,
            attempt,
          },
          "Webhook endpoint returned non-2xx response",
        )
      }

      return true
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn(
          { webhookId: webhook.id, url: webhook.url, attempt },
          "Webhook endpoint timed out",
        )
        return true
      }

      if (!this.isConnectionError(error)) {
        logger.warn(
          {
            err: error,
            webhookId: webhook.id,
            url: webhook.url,
            attempt,
          },
          "Webhook request failed without retry",
        )
        return true
      }

      logger.warn(
        {
          err: error,
          webhookId: webhook.id,
          url: webhook.url,
          attempt,
        },
        "Webhook connection failed",
      )

      return false
    }
  }

  async execute({
    webhook,
    payload,
  }: {
    webhook: WebhookWithConditions
    payload: WebhookPayload
  }): Promise<void> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const shouldStop = await this.attemptRequest(webhook, payload, attempt)

      if (shouldStop) {
        return
      }

      if (attempt < this.MAX_RETRIES) {
        logger.warn(
          {
            webhookId: webhook.id,
            url: webhook.url,
            attempt,
            maxRetries: this.MAX_RETRIES,
          },
          "Retrying webhook after connection failure",
        )
        await this.delay(this.RETRY_DELAY_MS * attempt)
      }
    }

    logger.error(
      { webhookId: webhook.id, url: webhook.url },
      `Webhook failed after ${this.MAX_RETRIES} retries`,
    )
  }
}
