import { logger } from "../../lib/logger"
import type { WebhookEventData, WebhookWithConditions } from "../types"

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

  private createPayload(
    webhook: WebhookWithConditions,
    eventData: WebhookEventData,
  ) {
    return {
      webhookId: webhook.id,
      webhookName: webhook.name,
      chatbotId: webhook.chatbotId,
      contactId: eventData.contactId,
      eventType: eventData.eventType,
      eventData: eventData.eventData,
      timestamp: eventData.timestamp,
    }
  }

  private executeRequest(url: string, payload: unknown): Promise<Response> {
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
    payload: unknown,
    _attempt: number,
  ): Promise<boolean> {
    try {
      const _response = await this.executeRequest(webhook.url, payload)

      // logger.info(`Webhook ${webhook.id} executed successfully`, {
      //   webhookId: webhook.id,
      //   url: webhook.url,
      //   status: _response.status,
      //   _attempt,
      // })

      return true
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // logger.warn(`Webhook ${webhook.id} timeout, not retrying`, {
        //   webhookId: webhook.id,
        //   url: webhook.url,
        // })
        return true
      }

      if (!this.isConnectionError(error)) {
        // logger.error(
        //   `Webhook ${webhook.id} failed with non-connection error, not retrying`,
        //   {
        //     webhookId: webhook.id,
        //     url: webhook.url,
        //     error: error instanceof Error ? error.message : "Unknown error",
        //   },
        // )
        return true
      }

      return false
    }
  }

  async execute({
    webhook,
    eventData,
  }: {
    webhook: WebhookWithConditions
    eventData: WebhookEventData
  }): Promise<void> {
    const payload = this.createPayload(webhook, eventData)

    // console.log({
    //   webhookUrl: webhook.url,
    //   payload,
    // })

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const shouldStop = await this.attemptRequest(webhook, payload, attempt)

      if (shouldStop) {
        return
      }

      if (attempt < this.MAX_RETRIES) {
        // logger.warn(
        //   `Webhook ${webhook.id} connection failed, retrying (${attempt}/${this.MAX_RETRIES})`,
        //   {
        //     webhookId: webhook.id,
        //     url: webhook.url,
        //     error: "Connection error",
        //   },
        // )
        await this.delay(this.RETRY_DELAY_MS * attempt)
      }
    }

    logger.error(
      `Webhook ${webhook.id} failed after ${this.MAX_RETRIES} retries`,
      {
        webhookId: webhook.id,
        url: webhook.url,
      },
    )
  }
}
