/**
 * Re-registers every connected Telegram bot's webhook with the current
 * `allowed_updates` and a webhook secret token.
 *
 * Run once after deploying the "Contact blocked/unblocked the bot" triggers.
 * Two kinds of older bots never deliver a block:
 * - bots connected before `my_chat_member` joined `TELEGRAM_ALLOWED_UPDATES`
 *   keep their old subscription until the webhook is registered again;
 * - bots connected before secret tokens existed have none, and the webhook
 *   drops unverified `my_chat_member` updates (a forged one would fire a
 *   trigger).
 *
 * Usage:
 *   pnpm --filter worker backfill:telegram-webhooks
 *
 * Per bot: one without a secret gets a fresh one. `setWebhook` runs FIRST and
 * the secret is saved after: an update that arrives in between carries the
 * secret while the stored config has none, which the webhook still accepts as
 * a legacy bot. Saving first would make it reject updates sent without one.
 * A bot that already has a secret keeps it. Idempotent and safe to re-run.
 *
 * Connected bots are read in bounded keyset pages and handled with small
 * concurrency. A revoked token (HTTP 401) is skipped; any other failure is
 * logged (`err`) and the exit code is 1, so a re-run picks the stragglers up.
 */
import { pathToFileURL } from "node:url"
import { telegramIntegrationService } from "@chatbotx.io/business"
import {
  isRevokedTokenError,
  registerWebhook,
} from "@chatbotx.io/integration-telegram"
import { logger } from "../src/lib/logger"

const PAGE_SIZE = 200
const CONCURRENCY = 5
const LOG_PREFIX = "[reregisterTelegramWebhooks]"

export type TelegramWebhookBot = {
  id: string
  workspaceId: string
  botId: string
  botToken: string
  webhookSecretToken?: string
}

export type ReregisterDeps = {
  /** One bounded page, ascending by id, strictly after `afterId`. */
  listPage: (input: {
    afterId?: string
    limit: number
  }) => Promise<TelegramWebhookBot[]>
  createSecretToken: () => string
  webhookUrlFor: (botId: string) => string
  registerWebhook: (input: {
    botToken: string
    webhookUrl: string
    secretToken: string
  }) => Promise<void>
  /** False when the bot already has a secret by now (stored one wins). */
  saveSecretToken: (input: {
    id: string
    webhookSecretToken: string
  }) => Promise<boolean>
  isRevokedToken: (error: unknown) => boolean
}

export type ReregisterSummary = {
  total: number
  registered: number
  secretsAdded: number
  revoked: number
  failed: number
}

type BotOutcome = "registered" | "secretAdded" | "revoked" | "failed"

const reregisterBot = async (
  bot: TelegramWebhookBot,
  deps: ReregisterDeps,
): Promise<BotOutcome> => {
  const logContext = {
    integrationId: bot.id,
    workspaceId: bot.workspaceId,
    botId: bot.botId,
  }
  const existingSecret = bot.webhookSecretToken
  const secretToken = existingSecret ?? deps.createSecretToken()
  try {
    await deps.registerWebhook({
      botToken: bot.botToken,
      webhookUrl: deps.webhookUrlFor(bot.botId),
      secretToken,
    })
  } catch (err) {
    if (deps.isRevokedToken(err)) {
      logger.warn(logContext, `${LOG_PREFIX} bot token revoked; skipped`)
      return "revoked"
    }
    logger.error({ err, ...logContext }, `${LOG_PREFIX} setWebhook failed`)
    return "failed"
  }

  if (existingSecret) {
    return "registered"
  }

  try {
    const saved = await deps.saveSecretToken({
      id: bot.id,
      webhookSecretToken: secretToken,
    })
    if (!saved) {
      // Reconnected between the read and now: Telegram holds our secret but
      // the row holds the reconnect's. A re-run registers the stored one.
      logger.error(
        logContext,
        `${LOG_PREFIX} bot got a secret meanwhile; re-run to register it`,
      )
      return "failed"
    }
    return "secretAdded"
  } catch (err) {
    logger.error(
      { err, ...logContext },
      `${LOG_PREFIX} saving the webhook secret failed; re-run to fix`,
    )
    return "failed"
  }
}

const reregisterPage = async (
  bots: TelegramWebhookBot[],
  deps: ReregisterDeps,
): Promise<BotOutcome[]> => {
  const outcomes: BotOutcome[] = []
  for (let index = 0; index < bots.length; index += CONCURRENCY) {
    const chunk = bots.slice(index, index + CONCURRENCY)
    outcomes.push(
      ...(await Promise.all(chunk.map((bot) => reregisterBot(bot, deps)))),
    )
  }
  return outcomes
}

const addOutcomes = (summary: ReregisterSummary, outcomes: BotOutcome[]) => {
  for (const outcome of outcomes) {
    summary.total += 1
    if (outcome === "registered") {
      summary.registered += 1
    } else if (outcome === "secretAdded") {
      summary.registered += 1
      summary.secretsAdded += 1
    } else if (outcome === "revoked") {
      summary.revoked += 1
    } else {
      summary.failed += 1
    }
  }
}

export const reregisterTelegramWebhooks = async (
  deps: ReregisterDeps,
): Promise<ReregisterSummary> => {
  const summary: ReregisterSummary = {
    total: 0,
    registered: 0,
    secretsAdded: 0,
    revoked: 0,
    failed: 0,
  }
  let afterId: string | undefined

  while (true) {
    const bots = await deps.listPage({ afterId, limit: PAGE_SIZE })
    if (bots.length === 0) {
      break
    }
    addOutcomes(summary, await reregisterPage(bots, deps))
    if (bots.length < PAGE_SIZE) {
      break
    }
    afterId = bots.at(-1)?.id
  }

  logger.info(summary, `${LOG_PREFIX} done`)
  return summary
}

type StoredTelegramAuth = {
  secretText?: unknown
  metadata?: { webhookSecretToken?: unknown }
}

/** Reads the bot token and secret out of the stored `auth` JSON; null when unusable. */
export const toWebhookBot = (row: {
  id: string
  workspaceId: string
  botId: string
  auth: Record<string, unknown>
}): TelegramWebhookBot | null => {
  const auth = row.auth as StoredTelegramAuth
  if (typeof auth.secretText !== "string" || auth.secretText === "") {
    return null
  }
  const secret = auth.metadata?.webhookSecretToken
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    botId: row.botId,
    botToken: auth.secretText,
    ...(typeof secret === "string" && secret !== ""
      ? { webhookSecretToken: secret }
      : {}),
  }
}

/** Same origin the builder's connect action registers (`buildBrokerCallbackUrl`). */
const webhookOrigin = (): string => {
  const base =
    process.env.NEXT_PUBLIC_BROKER_URL ?? process.env.NEXT_PUBLIC_BUILDER_URL
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_BROKER_URL or NEXT_PUBLIC_BUILDER_URL must be set",
    )
  }
  return new URL(base).origin
}

const main = async (): Promise<void> => {
  const origin = webhookOrigin()
  const summary = await reregisterTelegramWebhooks({
    listPage: async (input) => {
      const rows =
        await telegramIntegrationService.listConnectedForWebhookRefresh(input)
      return rows.flatMap((row) => {
        const bot = toWebhookBot(row)
        if (!bot) {
          logger.error(
            { integrationId: row.id, workspaceId: row.workspaceId },
            `${LOG_PREFIX} stored auth has no bot token; skipped`,
          )
          return []
        }
        return [bot]
      })
    },
    createSecretToken: () =>
      telegramIntegrationService.createWebhookSecretToken(),
    webhookUrlFor: (botId) =>
      new URL(
        `/integrations/telegram/webhook?botId=${encodeURIComponent(botId)}`,
        origin,
      ).toString(),
    registerWebhook: (input) => registerWebhook(input),
    saveSecretToken: (input) =>
      telegramIntegrationService.saveMissingWebhookSecretToken(input),
    isRevokedToken: isRevokedTokenError,
  })
  process.exit(summary.failed > 0 ? 1 : 0)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err: unknown) => {
    logger.error({ err }, `${LOG_PREFIX} crashed`)
    process.exit(1)
  })
}
