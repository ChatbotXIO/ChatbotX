/**
 * Re-subscribes every connected WhatsApp Business Account to the Conversation
 * Routing webhook fields (`messaging_handovers`, `standby`).
 *
 * Run once after deploying Conversation Routing: numbers connected before it
 * never got the fields (new connects and reconnects add them). Idempotent:
 * Meta replaces the subscribed field list.
 *
 * Usage:
 *   pnpm --filter worker backfill:whatsapp-webhook-fields
 *
 * Field policy: no per-row record of `automatic_events` exists. Connect
 * subscribes without it, reconnect always with it, so each WABA first tries
 * reconnect's set (+ routing) and, if Meta rejects that, retries once with the
 * base set (+ routing). A row therefore never loses routing and never gains a
 * field Meta refuses. A failing row is logged and the run continues.
 *
 * Manual-connect numbers (the customer's own Meta app and token) are included
 * and re-subscribed exactly like manual connect does: with the stored
 * per-integration callback override (`metadata.webhookUrl` + `verifyToken`,
 * `overrideCallbackUrl: true`), so their callback is kept. Routing traffic
 * still needs the customer to subscribe their own app to the routing fields
 * in their App Dashboard.
 */
import { pathToFileURL } from "node:url"
import { integrationWhatsappService } from "@chatbotx.io/business"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { logger } from "../src/lib/logger"

const BATCH_SIZE = 50

export type BackfillIntegration = {
  id: string
  workspaceId: string
  wabaId: string
  auth: WhatsappAuthValue
}

export type BackfillDeps = {
  listIntegrations: () => Promise<BackfillIntegration[]>
  subscribe: (input: {
    auth: WhatsappAuthValue
    includeAutomaticEvents: boolean
    overrideCallbackUrl: boolean
  }) => Promise<void>
}

export type BackfillSummary = {
  total: number
  subscribed: number
  subscribedWithFallback: number
  /** Manual-connect WABAs among `total` (subscribed with their own callback). */
  manual: number
  failed: number
}

const EMPTY_SUMMARY: BackfillSummary = {
  total: 0,
  subscribed: 0,
  subscribedWithFallback: 0,
  manual: 0,
  failed: 0,
}

type RowOutcome = "subscribed" | "subscribedWithFallback" | "failed"

const isManualIntegration = (integration: BackfillIntegration): boolean =>
  integration.auth.metadata.isManual === true

const subscribeRow = async (
  integration: BackfillIntegration,
  subscribe: BackfillDeps["subscribe"],
): Promise<RowOutcome> => {
  // Manual connect subscribes with its stored callback override; anything
  // else would move the customer's webhook to the platform callback.
  const overrideCallbackUrl = isManualIntegration(integration)
  try {
    await subscribe({
      auth: integration.auth,
      includeAutomaticEvents: true,
      overrideCallbackUrl,
    })
    return "subscribed"
  } catch (err) {
    logger.warn(
      { err, wabaId: integration.wabaId, integrationId: integration.id },
      "[resubscribeWhatsappWebhookFields] full field set rejected; retrying with base + routing",
    )
  }

  try {
    await subscribe({
      auth: integration.auth,
      includeAutomaticEvents: false,
      overrideCallbackUrl,
    })
    return "subscribedWithFallback"
  } catch (err) {
    logger.error(
      { err, wabaId: integration.wabaId, integrationId: integration.id },
      "[resubscribeWhatsappWebhookFields] subscription failed",
    )
    return "failed"
  }
}

/**
 * The Meta subscription identity: `subscribed_apps` holds one entry per WABA
 * and calling app (`auth.clientId` — the platform app id, or for manual
 * connect the app id `debug_token` derived from the customer's token). Rows
 * sharing it (numbers on the same WABA, or the same WABA in several
 * workspaces) need a single call. A row whose app id is unknown is keyed on
 * its own id, so it is never skipped in favour of a different app.
 */
const subscriptionKey = (integration: BackfillIntegration): string => {
  const appId = integration.auth.clientId?.trim()
  return appId
    ? `${integration.wabaId}:${appId}`
    : `${integration.wabaId}:unknown-app:${integration.id}`
}

const pickTargets = (
  integrations: BackfillIntegration[],
): BackfillIntegration[] => {
  const bySubscription = new Map<string, BackfillIntegration>()
  for (const integration of integrations) {
    const key = subscriptionKey(integration)
    if (!bySubscription.has(key)) {
      bySubscription.set(key, integration)
    }
  }
  return [...bySubscription.values()]
}

export const resubscribeWhatsappWebhookFields = async (
  deps: BackfillDeps,
): Promise<BackfillSummary> => {
  const targets = pickTargets(await deps.listIntegrations())
  const summary = {
    ...EMPTY_SUMMARY,
    total: targets.length,
    manual: targets.filter(isManualIntegration).length,
  }
  const counts: Record<RowOutcome, number> = {
    subscribed: 0,
    subscribedWithFallback: 0,
    failed: 0,
  }

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    const outcomes = await Promise.all(
      batch.map((integration) => subscribeRow(integration, deps.subscribe)),
    )
    for (const outcome of outcomes) {
      counts[outcome] += 1
    }
  }

  const result: BackfillSummary = { ...summary, ...counts }
  logger.info(result, "[resubscribeWhatsappWebhookFields] done")
  return result
}

const main = async (): Promise<void> => {
  const summary = await resubscribeWhatsappWebhookFields({
    listIntegrations: async () => {
      const rows =
        await integrationWhatsappService.findAllConnectedForWebhookSubscription()
      return rows.map((row) => ({
        ...row,
        auth: row.auth as WhatsappAuthValue,
      }))
    },
    subscribe: async ({
      auth,
      includeAutomaticEvents,
      overrideCallbackUrl,
    }) => {
      await subscribeWebhook({
        auth,
        includeAutomaticEvents,
        overrideCallbackUrl,
      })
    },
  })
  process.exit(summary.failed > 0 ? 1 : 0)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err: unknown) => {
    logger.error({ err }, "[resubscribeWhatsappWebhookFields] crashed")
    process.exit(1)
  })
}
