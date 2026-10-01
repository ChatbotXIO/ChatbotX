/**
 * Re-subscribes every connected Messenger Page to the current Page webhook
 * fields (`PAGE_SUBSCRIBE_SCOPES`, which now include `messaging_handovers` and
 * `standby`).
 *
 * Run once after deploying Conversation Routing for Messenger: Pages connected
 * before it never got the handover fields (new connects and reconnects add
 * them). Idempotent and safe to re-run: `POST /me/subscribed_apps` is scoped to
 * this app (other apps' subscriptions are untouched) and a repeat with the same
 * fields is a Meta no-op.
 *
 * Usage:
 *   pnpm --filter worker backfill:messenger-webhook-fields
 *
 * The connected Pages are read in bounded keyset pages (never one unbounded
 * select) and re-subscribed with small concurrency. A failing Page is logged
 * (`err`) and the run continues; the exit code is 1 if any Page failed, so a
 * re-run picks the stragglers up.
 *
 * `POST /me/subscribed_apps` REPLACES the field list, so each Page's current
 * fields are read first (`GET /me/subscribed_apps`) and the routing fields are
 * UNIONed in: a Page never loses a field it had (notably `leadgen`). If that
 * read fails the Page is re-subscribed with the leadgen-inclusive reconnect
 * scope instead of the bare base set, and the failure is logged (`err`).
 */
import { pathToFileURL } from "node:url"
import { messengerIntegrationService } from "@chatbotx.io/business"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import {
  getPageSubscribedFields,
  LEAD_ADS_PAGE_SUBSCRIBE_FIELDS,
  PAGE_SUBSCRIBE_SCOPES,
  ROUTING_PAGE_SUBSCRIBE_FIELDS,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
import { logger } from "../src/lib/logger"

const PAGE_SIZE = 200
const CONCURRENCY = 5

export type BackfillIntegration = {
  id: string
  workspaceId: string
  pageId: string
  auth: MessengerAuthValue
}

export type BackfillDeps = {
  /** One bounded page, ascending by id, strictly after `afterId`. */
  listPage: (input: {
    afterId?: string
    limit: number
  }) => Promise<BackfillIntegration[]>
  /** The Page's current subscribed fields for this app (throws on failure). */
  getSubscribedFields: (input: {
    accessToken: string
    version?: string
    appId?: string | null
  }) => Promise<string[]>
  subscribe: (input: {
    pageId: string
    accessToken: string
    version?: string
    /** Comma-separated `subscribed_fields`; replaces the app's list. */
    subscribedFields: string
  }) => Promise<void>
}

export type BackfillSummary = {
  total: number
  subscribed: number
  failed: number
}

/**
 * The fields to POST: what the Page already has plus the routing fields. An
 * app with no current subscription gets the full base set (which includes the
 * routing fields). A failed read falls back to the leadgen-inclusive scope so
 * a Lead Ads Page cannot lose lead delivery.
 */
const resolveSubscribedFields = async (
  integration: BackfillIntegration,
  getSubscribedFields: BackfillDeps["getSubscribedFields"],
): Promise<string[]> => {
  try {
    const current = await getSubscribedFields({
      accessToken: integration.auth.tokens.accessToken,
      version: integration.auth.metadata.version,
      appId: integration.auth.clientId,
    })
    const base = current.length > 0 ? current : PAGE_SUBSCRIBE_SCOPES
    return [...new Set([...base, ...ROUTING_PAGE_SUBSCRIBE_FIELDS])]
  } catch (err) {
    logger.error(
      {
        err,
        pageId: integration.pageId,
        integrationId: integration.id,
        workspaceId: integration.workspaceId,
      },
      "[resubscribeMessengerWebhookFields] could not read current fields; using the leadgen-inclusive scope",
    )
    return LEAD_ADS_PAGE_SUBSCRIBE_FIELDS
  }
}

const subscribeRow = async (
  integration: BackfillIntegration,
  deps: Pick<BackfillDeps, "subscribe" | "getSubscribedFields">,
): Promise<boolean> => {
  try {
    const fields = await resolveSubscribedFields(
      integration,
      deps.getSubscribedFields,
    )
    await deps.subscribe({
      pageId: integration.pageId,
      accessToken: integration.auth.tokens.accessToken,
      version: integration.auth.metadata.version,
      subscribedFields: fields.join(","),
    })
    return true
  } catch (err) {
    logger.error(
      {
        err,
        pageId: integration.pageId,
        integrationId: integration.id,
        workspaceId: integration.workspaceId,
      },
      "[resubscribeMessengerWebhookFields] subscription failed",
    )
    return false
  }
}

/** Runs one page with at most `CONCURRENCY` calls in flight. */
const subscribePage = async (
  rows: BackfillIntegration[],
  deps: Pick<BackfillDeps, "subscribe" | "getSubscribedFields">,
): Promise<boolean[]> => {
  const outcomes: boolean[] = []
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY)
    outcomes.push(
      ...(await Promise.all(chunk.map((row) => subscribeRow(row, deps)))),
    )
  }
  return outcomes
}

export const resubscribeMessengerWebhookFields = async (
  deps: BackfillDeps,
): Promise<BackfillSummary> => {
  const summary: BackfillSummary = { total: 0, subscribed: 0, failed: 0 }
  let afterId: string | undefined

  while (true) {
    const rows = await deps.listPage({ afterId, limit: PAGE_SIZE })
    if (rows.length === 0) {
      break
    }
    const outcomes = await subscribePage(rows, deps)
    const subscribed = outcomes.filter(Boolean).length
    summary.total += rows.length
    summary.subscribed += subscribed
    summary.failed += rows.length - subscribed
    if (rows.length < PAGE_SIZE) {
      break
    }
    afterId = rows.at(-1)?.id
  }

  logger.info(summary, "[resubscribeMessengerWebhookFields] done")
  return summary
}

const main = async (): Promise<void> => {
  const summary = await resubscribeMessengerWebhookFields({
    listPage: async (input) => {
      const rows =
        await messengerIntegrationService.listConnectedForWebhookSubscription(
          input,
        )
      return rows.map((row) => ({
        ...row,
        auth: row.auth as MessengerAuthValue,
      }))
    },
    getSubscribedFields: (input) => getPageSubscribedFields(input),
    subscribe: (input) => subscribePageToAppWebhook(input),
  })
  process.exit(summary.failed > 0 ? 1 : 0)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err: unknown) => {
    logger.error({ err }, "[resubscribeMessengerWebhookFields] crashed")
    process.exit(1)
  })
}
