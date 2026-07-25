import { workspaceService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { TriggerEventType } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  isMatchableEventType,
  matchableConditionTypesFor,
  SCANNER_VERIFIED_EVENT_TYPES,
} from "@chatbotx.io/events"
import { logger } from "../../lib/logger"
import { ConditionEvaluator } from "../../trigger/services/condition-evaluator"
import type {
  MatchableWebhookEventData,
  WebhookEventData,
  WebhookWithConditions,
} from "../types"
import { WebhookExecutor } from "./webhook-executor.service"
import { buildWebhookPayload } from "./webhook-payload.builder"

const SCANNER_VERIFIED_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  SCANNER_VERIFIED_EVENT_TYPES,
)

function hasConditionType(
  conditionTypes: readonly TriggerEventType[],
  conditionType: string,
): boolean {
  return conditionTypes.some((type) => type === conditionType)
}

export class WebhookMatcherService {
  private readonly conditionEvaluator: ConditionEvaluator
  private readonly webhookExecutor: WebhookExecutor

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator()
    this.webhookExecutor = new WebhookExecutor()
  }

  async findAndExecuteWebhooks(eventData: WebhookEventData): Promise<void> {
    const { workspaceId, eventType, eventData: metadata } = eventData

    const conditionTypes = matchableConditionTypesFor(eventType)
    if (conditionTypes.length === 0) {
      return
    }
    if (!isMatchableEventType(eventType)) {
      return
    }
    const matchableEventData: MatchableWebhookEventData = {
      ...eventData,
      eventType,
    }

    const sourceId = metadata.sourceId as string | undefined

    const webhooks = await db.query.webhookModel.findMany({
      where: {
        workspaceId,
        active: true,
      },
      with: {
        conditions: true,
      },
    })

    // Filter webhooks that have matching conditions
    const filteredWebhooks = webhooks.filter((webhook) =>
      webhook.conditions.some(
        (c) =>
          hasConditionType(conditionTypes, c.type) &&
          (sourceId ? c.sourceId === sourceId : true),
      ),
    )

    if (filteredWebhooks.length === 0) {
      return
    }

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })

    if (!workspace) {
      return
    }

    const matchedWebhooks = await this.selectMatchingWebhooks(
      filteredWebhooks,
      matchableEventData,
      workspace,
    )

    if (matchedWebhooks.length === 0) {
      return
    }

    // Built once for the whole fan-out, and deliberately before the first
    // delivery. A failure here is allowed to fail the job so the queue retries
    // the event: nothing has been sent yet, so the retry cannot duplicate a
    // delivery. Swallowing it instead would drop every webhook at once.
    const payload = await buildWebhookPayload(matchableEventData)

    await Promise.allSettled(
      matchedWebhooks.map(async (webhook) => {
        try {
          await this.webhookExecutor.execute({ webhook, payload })
        } catch (error) {
          // Past this point deliveries are in flight, so one bad endpoint must
          // not fail the job and trigger a retry that re-sends the others.
          logger.error(
            error,
            `Failed to execute webhook ${webhook.id} for workspace ${workspaceId}`,
          )
        }
      }),
    )
  }

  /**
   * Evaluates every candidate concurrently and keeps the matches. A webhook
   * whose conditions cannot be evaluated is skipped and logged rather than
   * thrown: the matched webhooks are delivered after this step, so failing the
   * job here would re-send them on the queue retry.
   */
  private async selectMatchingWebhooks(
    webhooks: WebhookWithConditions[],
    eventData: MatchableWebhookEventData,
    workspace: WorkspaceModel,
  ): Promise<WebhookWithConditions[]> {
    const evaluated = await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          const isMatch = await this.evaluateWebhookConditions(
            webhook,
            eventData,
            workspace,
          )

          return isMatch ? [webhook] : []
        } catch (error) {
          logger.error(
            error,
            `Failed to evaluate conditions for webhook ${webhook.id} in workspace ${eventData.workspaceId}`,
          )

          return []
        }
      }),
    )

    return evaluated.flat()
  }

  private async evaluateWebhookConditions(
    webhook: WebhookWithConditions,
    eventData: MatchableWebhookEventData,
    workspace: WorkspaceModel,
  ): Promise<boolean> {
    const { conditions } = webhook

    if (conditions.length === 0) {
      return false
    }

    for (const condition of conditions) {
      if (SCANNER_VERIFIED_EVENT_TYPE_SET.has(eventData.eventType)) {
        // Scanner-driven events were already temporally verified before enqueue.
        // Re-evaluating them here can swallow one-shot datetime webhooks forever.
        if (
          condition.type === eventData.eventType &&
          condition.sourceId === (eventData.eventData.sourceId as string)
        ) {
          return true
        }
        continue
      }

      const isMatch = await this.conditionEvaluator.evaluate({
        condition,
        eventData: {
          workspaceId: webhook.workspaceId,
          contactId: eventData.contactId,
          eventType: eventData.eventType,
          eventData: eventData.eventData,
          timestamp: eventData.timestamp,
        },
        workspaceId: webhook.workspaceId,
        contactId: eventData.contactId,
        workspace,
      })

      if (isMatch) {
        return true
      }
    }

    return false
  }
}
