import { db } from "@chatbotx.io/database/client"
import {
  type FacebookMarketingMessageStatus,
  type FacebookMarketingMessageStatusReason,
  MM_ACTIVE_STATUSES,
  MM_BACKOFF_MS,
  MM_DISPATCH_WALL_MS,
  MM_LIFETIME_FALLBACK_MS,
  MM_OPT_IN_TOPIC_TITLE,
  MM_PREPARE_RETRY_WINDOW_MS,
  MM_RETRY_DELAY_MS,
  MM_SENDS_PER_MINUTE,
  MM_UNCONFIRMED_GRACE_MS,
  MM_UNKNOWN_ERROR_BREAKER,
  mmContentSchema,
} from "@chatbotx.io/database/partials"
import {
  facebookMarketingMessageAudienceRepository,
  facebookMarketingMessageRecipientRepository,
  facebookMarketingMessageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  FacebookMarketingMessageModel,
  NewFacebookMarketingMessageRecipient,
} from "@chatbotx.io/database/types"
import {
  classifyMarketingMessageError,
  GRAPH_ERROR_CODE_INVALID_TOKEN,
  getAdAccountDetails,
  getGraphErrorCode,
  getMessageCampaignSchedule,
  getMessageDeliveryEstimate,
  isGraphTransportError,
  listNotificationMessageTokens,
  type NotificationMessageToken,
  sendMarketingMessage,
} from "@chatbotx.io/integration-facebook-ads"
import { casStore } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { addDays, startOfDay } from "date-fns"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { BaseService } from "../base.service"
import { facebookMarketingMessagesService } from "../facebook-marketing-messages/service"
import { logger } from "../logger"
import { buildMarketingMessagePayload } from "./content-payload"
import { mmDeliveryError } from "./errors"
import { resolveMarketingMessagePageToken } from "./page-token"
import {
  getMarketingMessageStats,
  type MarketingMessageCampaignStats,
} from "./stats"
import { recordMarketingMessageUsage } from "./usage"
import {
  type ApplyWebhookResult,
  applyMarketingMessageWebhook,
  type MarketingMessageWebhookEvent,
} from "./webhook"

const INSERT_CHUNK = 1000
const DISPATCH_WINDOW_MS = 55_000

type PauseInput = {
  id: string
  reason: FacebookMarketingMessageStatusReason
  errorCode?: number | null
  errorMessage?: string | null
}

type FetchOutcome =
  | { kind: "ok"; tokens: NotificationMessageToken[] }
  | { kind: "retryLater"; code: number | null; message: string }
  | { kind: "grantInvalid" }
  | { kind: "failed"; code: number | null; message: string }

const clearedError = {
  statusErrorCode: null,
  statusErrorMessage: null,
} as const

const clearedReason = {
  statusReason: null,
  ...clearedError,
} as const

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error"
}

function classifyFetchError(error: unknown, retryDeadline: Date): FetchOutcome {
  const code = getGraphErrorCode(error)
  if (code === GRAPH_ERROR_CODE_INVALID_TOKEN) {
    return { kind: "grantInvalid" }
  }
  const retryable =
    code === undefined
      ? isGraphTransportError(error)
      : ["transient", "notReady"].includes(classifyMarketingMessageError(code))
  if (retryable && new Date() < retryDeadline) {
    return {
      kind: "retryLater",
      code: code ?? null,
      message: describeError(error),
    }
  }
  return { kind: "failed", code: code ?? null, message: describeError(error) }
}

type DispatchOutcome = "continue" | "dayDone" | "paused" | "ended"

type UnknownStreak = { code: number | null; count: number }

/** Consecutive unclassified errors with the same code (null included). */
function nextUnknownStreak(
  previous: UnknownStreak | null,
  code: number | null,
): UnknownStreak {
  return previous && previous.code === code
    ? { code, count: previous.count + 1 }
    : { code, count: 1 }
}

function nextLocalMidnight(now: Date, timezoneName: string): Date {
  return fromZonedTime(
    startOfDay(addDays(toZonedTime(now, timezoneName), 1)),
    timezoneName,
  )
}

class FacebookMarketingMessageDeliveryService extends BaseService {
  async resolveGrantToken(
    workspaceId: string,
  ): Promise<{ accessToken: string } | null> {
    const row = await facebookMarketingMessagesService.findAuth(workspaceId)
    if (row?.status !== "active") {
      return null
    }
    const auth = await facebookMarketingMessagesService.decryptAuth(row)
    return auth ? { accessToken: auth.accessToken } : null
  }

  /** scheduled/sending/waitingNextDay → paused. A lost race is a no-op. */
  async pause(input: PauseInput): Promise<void> {
    await facebookMarketingMessageRepository.transition({
      id: input.id,
      from: MM_ACTIVE_STATUSES,
      patch: {
        status: "paused",
        statusReason: input.reason,
        statusErrorCode: input.errorCode ?? null,
        statusErrorMessage: input.errorMessage ?? null,
      },
    })
  }

  private async fail(
    id: string,
    reason: FacebookMarketingMessageStatusReason,
    errorCode: number | null = null,
    errorMessage: string | null = null,
  ): Promise<void> {
    await facebookMarketingMessageRepository.transition({
      id,
      from: MM_ACTIVE_STATUSES,
      patch: {
        status: "failed",
        statusReason: reason,
        statusErrorCode: errorCode,
        statusErrorMessage: errorMessage,
        completedAt: new Date(),
      },
    })
  }

  /**
   * Shows a retryable Meta problem on an active campaign without changing its
   * status (the UI renders it as a warning). A lost race is a no-op.
   */
  private async setStatusError(input: {
    id: string
    from?: FacebookMarketingMessageStatus[]
    code: number | null
    message: string | null
    extra?: { nextDayAt?: Date | null }
  }): Promise<void> {
    await facebookMarketingMessageRepository.transition({
      id: input.id,
      from: input.from ?? MM_ACTIVE_STATUSES,
      patch: {
        statusErrorCode: input.code,
        statusErrorMessage: input.message,
        ...input.extra,
      },
    })
  }

  /**
   * Snapshots the campaign's subscription tokens into recipient rows and moves
   * `scheduled → sending`. Safe to call on every tick: it does nothing unless
   * the campaign is `scheduled`, due and past any retry backoff. A retryable
   * Graph failure leaves it `scheduled` with `nextDayAt` (reused as the "not
   * before" time) set `MM_BACKOFF_MS` ahead and the error shown.
   */
  async prepare(campaignRowId: string): Promise<void> {
    const campaign =
      await facebookMarketingMessageRepository.findById(campaignRowId)
    const now = new Date()
    if (
      campaign?.status !== "scheduled" ||
      (campaign.startsAt && campaign.startsAt > now) ||
      (campaign.nextDayAt && campaign.nextDayAt > now)
    ) {
      return
    }

    const [grant, page] = await Promise.all([
      this.resolveGrantToken(campaign.workspaceId),
      resolveMarketingMessagePageToken({
        workspaceId: campaign.workspaceId,
        pageId: campaign.pageId,
      }),
    ])
    if (!grant) {
      await this.pause({ id: campaign.id, reason: "grantInvalid" })
      return
    }
    if (!page) {
      await this.pause({ id: campaign.id, reason: "pageNotConnected" })
      return
    }

    let customAudienceId: string | undefined
    if (campaign.targetType === "customAudience") {
      const audience = campaign.audienceId
        ? await facebookMarketingMessageAudienceRepository.findForWorkspace({
            id: campaign.audienceId,
            workspaceId: campaign.workspaceId,
          })
        : null
      if (!audience) {
        await this.fail(
          campaign.id,
          "tokenFetchFailed",
          null,
          "Custom audience not found",
        )
        return
      }
      customAudienceId = audience.customAudienceId
    }

    let adSetId: string
    let endTime: Date | null
    let timezoneName: string
    let tokens: NotificationMessageToken[]
    try {
      const [schedule, account] = await Promise.all([
        getMessageCampaignSchedule({
          accessToken: grant.accessToken,
          campaignId: campaign.campaignId,
        }),
        getAdAccountDetails(grant.accessToken, campaign.adAccountId),
      ])
      adSetId = schedule.adSetId
      endTime = schedule.endTime
      timezoneName = account.timezoneName
      tokens = await listNotificationMessageTokens({
        pageAccessToken: page.accessToken,
        pageId: campaign.pageId,
        customAudienceId,
        version: page.version,
      })
    } catch (error) {
      const outcome = classifyFetchError(
        error,
        new Date(
          (campaign.startsAt ?? campaign.createdAt).getTime() +
            MM_PREPARE_RETRY_WINDOW_MS,
        ),
      )
      logger.warn(
        { err: error, campaignRowId: campaign.id, outcome: outcome.kind },
        "Marketing message token snapshot failed",
      )
      if (outcome.kind === "grantInvalid") {
        await facebookMarketingMessagesService.markAuthInvalid(
          campaign.workspaceId,
        )
        await this.pause({ id: campaign.id, reason: "grantInvalid" })
      } else if (outcome.kind === "retryLater") {
        await this.setStatusError({
          id: campaign.id,
          from: ["scheduled"],
          code: outcome.code,
          message: outcome.message,
          extra: { nextDayAt: new Date(Date.now() + MM_BACKOFF_MS) },
        })
      } else if (outcome.kind === "failed") {
        await this.fail(
          campaign.id,
          "tokenFetchFailed",
          outcome.code,
          outcome.message,
        )
      }
      return
    }

    tokens = [...new Map(tokens.map((t) => [t.token, t])).values()]
    if (tokens.length === 0) {
      await this.fail(campaign.id, "noTokens")
      return
    }

    const matched =
      campaign.targetType === "optIn"
        ? tokens.filter((t) => t.topicTitle === MM_OPT_IN_TOPIC_TITLE)
        : tokens
    if (matched.length === 0) {
      const titles = [
        ...new Set(tokens.map((t) => t.topicTitle).filter((t) => !!t)),
      ]
      await this.fail(
        campaign.id,
        "noMatchingTopic",
        null,
        titles.join(", ") || null,
      )
      return
    }

    for (let i = 0; i < matched.length; i += INSERT_CHUNK) {
      const rows: NewFacebookMarketingMessageRecipient[] = matched
        .slice(i, i + INSERT_CHUNK)
        .map((t) => ({
          id: createId(),
          workspaceId: campaign.workspaceId,
          campaignRowId: campaign.id,
          subscriptionToken: t.token,
          psid: t.psid,
          nextEligibleAt: t.nextEligibleAt,
          status: "pending",
          attempts: 0,
        }))
      await facebookMarketingMessageRecipientRepository.insertMany(rows)
    }

    const started = await facebookMarketingMessageRepository.transition({
      id: campaign.id,
      from: ["scheduled"],
      patch: {
        status: "sending",
        tokenCount: matched.length,
        startedAt: new Date(),
        adSetId,
        // A lifetime ad set without an end_time still must stop some day.
        metaEndsAt:
          endTime ??
          (campaign.budgetType === "lifetime"
            ? new Date(campaign.createdAt.getTime() + MM_LIFETIME_FALLBACK_MS)
            : null),
        timezoneName,
        nextDayAt: null,
        ...clearedReason,
      },
    })
    if (started?.budgetType === "daily") {
      await this.startDay(campaign.id)
    }
  }

  /** Daily campaigns only: sets today's target and returns to `sending`. */
  async startDay(campaignRowId: string): Promise<void> {
    const campaign =
      await facebookMarketingMessageRepository.findById(campaignRowId)
    if (
      campaign?.budgetType !== "daily" ||
      !campaign.adSetId ||
      !["sending", "waitingNextDay"].includes(campaign.status)
    ) {
      return
    }
    const grant = await this.resolveGrantToken(campaign.workspaceId)
    if (!grant) {
      await this.pause({ id: campaign.id, reason: "grantInvalid" })
      return
    }

    let deliveryUpper: number
    try {
      const estimate = await getMessageDeliveryEstimate({
        accessToken: grant.accessToken,
        adAccountId: campaign.adAccountId,
        pageId: campaign.pageId,
        dailyBudgetMinorUnits: campaign.budgetMinorUnits,
      })
      deliveryUpper = estimate.deliveryUpper
    } catch (error) {
      logger.warn(
        { err: error, campaignRowId: campaign.id },
        "Marketing message delivery estimate failed",
      )
      const code = getGraphErrorCode(error)
      const errorMessage = describeError(error)
      if (code === GRAPH_ERROR_CODE_INVALID_TOKEN) {
        await facebookMarketingMessagesService.markAuthInvalid(
          campaign.workspaceId,
        )
        await this.pause({
          id: campaign.id,
          reason: "grantInvalid",
          errorCode: GRAPH_ERROR_CODE_INVALID_TOKEN,
          errorMessage,
        })
        return
      }
      const cls =
        code === undefined ? null : classifyMarketingMessageError(code)
      if (code === undefined || cls === "transient" || cls === "notReady") {
        // Re-driven by the day-start cron once the backoff has passed.
        await facebookMarketingMessageRepository.transition({
          id: campaign.id,
          from: ["sending", "waitingNextDay"],
          patch: {
            status: "waitingNextDay",
            nextDayAt: new Date(Date.now() + MM_BACKOFF_MS),
            statusErrorCode: code ?? null,
            statusErrorMessage: errorMessage,
          },
        })
        return
      }
      await this.pause({
        id: campaign.id,
        reason: "metaBlocker",
        errorCode: code,
        errorMessage,
      })
      return
    }

    const { pending } =
      await facebookMarketingMessageRecipientRepository.countOutcomes(
        campaign.id,
      )
    await facebookMarketingMessageRepository.transition({
      id: campaign.id,
      from: ["sending", "waitingNextDay"],
      patch: {
        status: "sending",
        // A zero estimate must not stall the campaign forever: send at
        // least one and let Meta's 2300054 arbitrate the day.
        dayTarget:
          pending > 0 ? Math.max(1, Math.min(deliveryUpper, pending)) : 0,
        daySent: 0,
        nextDayAt: null,
        ...clearedError,
      },
    })
  }

  /**
   * Once-per-window lease so overlapping ticks never dispatch the same
   * campaign twice. A Redis failure fails open, like broadcasts.
   */
  async claimDispatchWindow(campaignRowId: string): Promise<boolean> {
    try {
      return await casStore.setIfAbsent(
        `mm:${campaignRowId}:dispatch-window`,
        true,
        DISPATCH_WINDOW_MS,
      )
    } catch (error) {
      logger.error(
        { err: error, campaignRowId },
        "Failed to claim marketing message dispatch window lease",
      )
      return true
    }
  }

  /**
   * Ends the campaign: the status moves, then pending recipients fail with
   * the campaign error and unconfirmed ones with `outcomeUnknown` (a late
   * webhook can still promote them). One transaction, status first: when a
   * Stop/Pause wins the race the recipients stay untouched for a Resume.
   */
  private async endCampaign(input: {
    campaign: FacebookMarketingMessageModel
    status: "completed" | "failed"
    reason: FacebookMarketingMessageStatusReason
    errorCode: number | null
    errorMessage: string
    now: Date
  }): Promise<void> {
    await db.transaction(async (tx) => {
      const row = await facebookMarketingMessageRepository.transition(
        {
          id: input.campaign.id,
          from: ["sending"],
          patch: {
            status: input.status,
            statusReason: input.reason,
            statusErrorCode: input.status === "failed" ? input.errorCode : null,
            statusErrorMessage:
              input.status === "failed" ? input.errorMessage : null,
            completedAt: input.now,
          },
        },
        tx,
      )
      if (!row) {
        return
      }
      await facebookMarketingMessageRecipientRepository.failRemaining(
        {
          campaignRowId: input.campaign.id,
          statuses: ["pending"],
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          errorSource: "send",
          now: input.now,
        },
        tx,
      )
      await facebookMarketingMessageRecipientRepository.failRemaining(
        {
          campaignRowId: input.campaign.id,
          statuses: ["unconfirmed"],
          errorCode: null,
          errorMessage: "outcomeUnknown",
          errorSource: "send",
          now: input.now,
        },
        tx,
      )
    })
  }

  /**
   * Sends one minute's worth of due recipients for a `sending` campaign.
   * Each recipient row is written right after its send, and an ambiguous
   * result goes to `unconfirmed` (never `pending`), so nothing is sent twice.
   */
  async dispatchBatch(input: {
    campaignRowId: string
    /** Bot messages the owner can still send; `null` = unlimited. */
    remainingQuota: () => Promise<number | null>
    isWorkspaceBlocked: () => Promise<boolean>
  }): Promise<{ sent: number; outcome: DispatchOutcome }> {
    const campaign = await facebookMarketingMessageRepository.findById(
      input.campaignRowId,
    )
    if (campaign?.status !== "sending") {
      return { sent: 0, outcome: "continue" }
    }
    const pauseWith = async (
      reason: FacebookMarketingMessageStatusReason,
    ): Promise<{ sent: number; outcome: DispatchOutcome }> => {
      await this.pause({ id: campaign.id, reason })
      return { sent: 0, outcome: "paused" }
    }

    if (await input.isWorkspaceBlocked()) {
      return await pauseWith("workspaceBlocked")
    }
    const remainingQuota = await input.remainingQuota()
    if (remainingQuota !== null && remainingQuota <= 0) {
      return await pauseWith("quotaReached")
    }
    const [page, grant] = await Promise.all([
      resolveMarketingMessagePageToken({
        workspaceId: campaign.workspaceId,
        pageId: campaign.pageId,
      }),
      this.resolveGrantToken(campaign.workspaceId),
    ])
    if (!page) {
      return await pauseWith("pageNotConnected")
    }
    if (!grant) {
      return await pauseWith("grantInvalid")
    }

    const isDaily = campaign.budgetType === "daily"
    let limit = MM_SENDS_PER_MINUTE
    if (isDaily) {
      limit = Math.min(
        limit,
        (campaign.dayTarget ?? 0) - (campaign.daySent ?? 0),
      )
    }
    // Usage is recorded after the batch, so never send more than the quota
    // left at its start. The next batch then pauses with `quotaReached`.
    if (remainingQuota !== null) {
      limit = Math.min(limit, remainingQuota)
    }
    if (limit <= 0) {
      const { pending } =
        await facebookMarketingMessageRecipientRepository.countOutcomes(
          campaign.id,
        )
      if (pending === 0) {
        return { sent: 0, outcome: "continue" }
      }
      await this.moveToWaitingNextDay(campaign)
      return { sent: 0, outcome: "dayDone" }
    }

    const parsedContent = mmContentSchema.safeParse(campaign.content)
    if (!parsedContent.success) {
      // Never valid again on a later tick: end it instead of looping.
      await this.endCampaign({
        campaign,
        status: "failed",
        reason: "contentRejected",
        errorCode: null,
        errorMessage: "The stored message content is invalid",
        now: new Date(),
      })
      return { sent: 0, outcome: "ended" }
    }
    const message = buildMarketingMessagePayload(parsedContent.data)
    const now = new Date()
    const batchStartedAt = Date.now()
    const due = await facebookMarketingMessageRecipientRepository.listDue({
      campaignRowId: campaign.id,
      now,
      limit,
    })

    type Claimed = NonNullable<
      Awaited<
        ReturnType<
          typeof facebookMarketingMessageRecipientRepository.claimForSend
        >
      >
    >
    let sends = 0
    let outcome: DispatchOutcome = "continue"
    let terminal: (() => Promise<void>) | null = null
    let warning: { code: number | null; message: string } | null = null
    let contentLocked = Boolean(campaign.firstSentAt)
    // Circuit breaker for unclassified errors: the same code over and over
    // means a campaign-wide problem, not bad recipients.
    let unknownStreak: UnknownStreak | null = null
    const markFailed = (
      claimed: Claimed,
      code: number | null,
      errorMessage: string,
    ) =>
      facebookMarketingMessageRecipientRepository.update({
        id: claimed.id,
        status: "failed",
        errorCode: code,
        errorMessage,
        errorSource: "send",
        failedAt: now,
      })
    // Undo the claim: not an attempt (pre-claim attempts, no sentAt).
    const revert = (claimed: Claimed) =>
      facebookMarketingMessageRecipientRepository.update({
        id: claimed.id,
        status: "pending",
        attempts: claimed.attempts - 1,
        sentAt: null,
      })

    try {
      for (const recipient of due) {
        // Bound the job's wall time; the next tick picks up the rest.
        if (Date.now() - batchStartedAt >= MM_DISPATCH_WALL_MS) {
          break
        }
        // The claim is the double-send guard: only the worker that flips
        // pending → unconfirmed may call Meta, and a DB failure after the call
        // leaves the row unconfirmed (never re-sent). It also refuses once
        // the campaign has left `sending` (stop/pause/delete).
        const claimed =
          await facebookMarketingMessageRecipientRepository.claimForSend({
            id: recipient.id,
            now: new Date(),
          })
        if (!claimed) {
          const current = await facebookMarketingMessageRepository.findById(
            campaign.id,
          )
          if (current?.status !== "sending") {
            break
          }
          continue
        }
        if (!contentLocked) {
          // Lock the content before the first Meta call, not after the batch.
          await facebookMarketingMessageRepository.setFirstSentAt(campaign.id)
          contentLocked = true
        }
        const result = await sendMarketingMessage({
          accessToken: grant.accessToken,
          adAccountId: campaign.adAccountId,
          campaignId: campaign.campaignId,
          subscriptionToken: recipient.subscriptionToken,
          message,
          version: page.version,
        })

        if (result.ok) {
          sends += 1
          unknownStreak = null
          // Conditional on `unconfirmed`: a webhook result that raced ahead
          // is never downgraded.
          await facebookMarketingMessageRecipientRepository.settleSend({
            id: claimed.id,
            status: "sent",
            trackingId: result.trackingId,
            errorCode: null,
            errorMessage: null,
          })
          continue
        }
        if (result.kind === "uncertain") {
          sends += 1
          unknownStreak = null
          await facebookMarketingMessageRecipientRepository.settleSend({
            id: claimed.id,
            errorCode: null,
            errorMessage: result.message,
            errorSource: "send",
          })
          continue
        }

        const { code, message: errorMessage } = result
        const errorClass = classifyMarketingMessageError(
          code,
          result.httpStatus,
        )
        if (errorClass !== "unknown") {
          unknownStreak = null
        }
        const pauseMetaBlocker = () =>
          this.pause({
            id: campaign.id,
            reason: "metaBlocker",
            errorCode: code,
            errorMessage,
          })
        switch (errorClass) {
          case "dailyBudget":
            await revert(claimed)
            if (isDaily) {
              outcome = "dayDone"
            } else {
              outcome = "paused"
              terminal = pauseMetaBlocker
            }
            break
          case "notReady":
          case "transient":
            await revert(claimed)
            warning = { code, message: errorMessage }
            break
          case "lifetimeBudget":
            await revert(claimed)
            outcome = "ended"
            terminal = () =>
              this.endCampaign({
                campaign,
                status: "completed",
                reason: "lifetimeBudgetReached",
                errorCode: code,
                errorMessage,
                now,
              })
            break
          case "contentInvalid":
            await revert(claimed)
            outcome = "ended"
            terminal = () =>
              this.endCampaign({
                campaign,
                status: "failed",
                reason: "contentRejected",
                errorCode: code,
                errorMessage,
                now,
              })
            break
          case "campaignInactive":
            await revert(claimed)
            if (campaign.metaEndsAt && campaign.metaEndsAt <= now) {
              outcome = "ended"
              terminal = () =>
                this.endCampaign({
                  campaign,
                  status: "completed",
                  reason: "campaignEnded",
                  errorCode: code,
                  errorMessage,
                  now,
                })
            } else {
              outcome = "paused"
              terminal = pauseMetaBlocker
            }
            break
          case "campaignBlocker":
            await revert(claimed)
            outcome = "paused"
            terminal = async () => {
              if (code === GRAPH_ERROR_CODE_INVALID_TOKEN) {
                await facebookMarketingMessagesService.markAuthInvalid(
                  campaign.workspaceId,
                )
              }
              await this.pause({
                id: campaign.id,
                reason:
                  code === GRAPH_ERROR_CODE_INVALID_TOKEN
                    ? "grantInvalid"
                    : "metaBlocker",
                errorCode: code,
                errorMessage,
              })
            }
            break
          case "recipientTiming":
            // Pre-claim attempts come from the claimed row (listDue's copy
            // may be stale).
            if (claimed.attempts - 1 === 0) {
              // The snapshot's eligibility time can already be past; retrying
              // then would only burn the one retry on the same error.
              const eligibleAt = recipient.nextEligibleAt
              await facebookMarketingMessageRecipientRepository.update({
                id: claimed.id,
                status: "pending",
                attempts: claimed.attempts,
                nextAttemptAt:
                  eligibleAt && eligibleAt > now
                    ? eligibleAt
                    : new Date(now.getTime() + MM_RETRY_DELAY_MS),
                errorCode: code,
                errorMessage,
                errorSource: "send",
              })
            } else {
              await markFailed(claimed, code, errorMessage)
            }
            continue
          case "recipientPermanent":
            await markFailed(claimed, code, errorMessage)
            continue
          default: {
            const streak = nextUnknownStreak(unknownStreak, code)
            unknownStreak = streak
            if (streak.count < MM_UNKNOWN_ERROR_BREAKER) {
              await markFailed(claimed, code, errorMessage)
              continue
            }
            await revert(claimed)
            outcome = "paused"
            terminal = pauseMetaBlocker
            break
          }
        }
        break
      }
    } finally {
      if (sends > 0) {
        await facebookMarketingMessageRepository.incrementDaySent({
          id: campaign.id,
          by: sends,
        })
        try {
          await recordMarketingMessageUsage({
            workspaceId: campaign.workspaceId,
            count: sends,
          })
        } catch (error) {
          logger.error(
            { err: error, campaignRowId: campaign.id, count: sends },
            "Marketing message usage increment failed",
          )
        }
      }
    }

    if (terminal) {
      await terminal()
    } else if (outcome === "dayDone") {
      await this.moveToWaitingNextDay(campaign)
    } else if (warning) {
      // Meta is not accepting sends right now; the next tick retries.
      await this.setStatusError({
        id: campaign.id,
        code: warning.code,
        message: warning.message,
      })
    } else if (
      sends > 0 &&
      (campaign.statusErrorCode !== null ||
        campaign.statusErrorMessage !== null)
    ) {
      await this.setStatusError({
        id: campaign.id,
        from: ["sending"],
        code: null,
        message: null,
      })
    }
    return { sent: sends, outcome }
  }

  private async moveToWaitingNextDay(
    campaign: FacebookMarketingMessageModel,
  ): Promise<void> {
    await facebookMarketingMessageRepository.transition({
      id: campaign.id,
      from: ["sending"],
      patch: {
        status: "waitingNextDay",
        nextDayAt: nextLocalMidnight(
          new Date(),
          campaign.timezoneName ?? "UTC",
        ),
      },
    })
  }

  /**
   * Completes a `sending` campaign once nothing is pending. Unconfirmed rows
   * get a grace window for Meta's webhook before they are failed as
   * `outcomeUnknown`.
   */
  async finalize(campaignRowId: string): Promise<void> {
    const campaign =
      await facebookMarketingMessageRepository.findById(campaignRowId)
    if (campaign?.status !== "sending") {
      return
    }
    const counts =
      await facebookMarketingMessageRecipientRepository.countOutcomes(
        campaignRowId,
      )
    if (counts.pending > 0) {
      return
    }
    const now = new Date()
    if (counts.unconfirmed > 0) {
      await facebookMarketingMessageRecipientRepository.failStaleUnconfirmed({
        campaignRowId,
        olderThan: new Date(now.getTime() - MM_UNCONFIRMED_GRACE_MS),
        now,
      })
      const after =
        await facebookMarketingMessageRecipientRepository.countOutcomes(
          campaignRowId,
        )
      if (after.pending > 0 || after.unconfirmed > 0) {
        return
      }
    }
    await facebookMarketingMessageRepository.transition({
      id: campaignRowId,
      from: ["sending"],
      patch: { status: "completed", completedAt: now, ...clearedReason },
    })
  }

  private async load(input: {
    workspaceId: string
    id: string
  }): Promise<FacebookMarketingMessageModel> {
    const campaign =
      await facebookMarketingMessageRepository.findForWorkspace(input)
    if (!campaign) {
      throw mmDeliveryError("mmNotFound")
    }
    return campaign
  }

  async stop(input: {
    workspaceId: string
    id: string
  }): Promise<FacebookMarketingMessageModel> {
    const campaign = await this.load(input)
    const row = await facebookMarketingMessageRepository.transition({
      id: campaign.id,
      from: ["scheduled", "sending", "waitingNextDay", "paused"],
      patch: { status: "stopped", ...clearedReason },
    })
    if (!row) {
      throw mmDeliveryError("mmInvalidState")
    }
    await this.audit("update", `stopped the marketing message "${row.name}"`)
    return row
  }

  async resume(input: {
    workspaceId: string
    id: string
  }): Promise<FacebookMarketingMessageModel> {
    const campaign = await this.load(input)
    if (campaign.status !== "paused" && campaign.status !== "stopped") {
      throw mmDeliveryError("mmInvalidState")
    }
    if (campaign.metaEndsAt && campaign.metaEndsAt <= new Date()) {
      throw mmDeliveryError("mmCampaignEnded")
    }
    const grant = await this.resolveGrantToken(input.workspaceId)
    if (!grant) {
      throw mmDeliveryError("mmGrantInvalid")
    }

    // Before the snapshot → scheduled, with a fresh retry window (startsAt)
    // and no backoff. A daily campaign re-estimates its day right away
    // (stale dayTarget/daySent are reset by startDay; Meta's 2300054
    // arbitrates if the day is already spent). Lifetime → sending.
    const now = new Date()
    let patch: Partial<FacebookMarketingMessageModel> = { status: "sending" }
    if (campaign.tokenCount === null) {
      patch = { status: "scheduled", startsAt: now, nextDayAt: null }
    } else if (campaign.budgetType === "daily") {
      patch = { status: "waitingNextDay", nextDayAt: now }
    }

    const row = await facebookMarketingMessageRepository.transition({
      id: campaign.id,
      from: ["paused", "stopped"],
      patch: {
        ...patch,
        resumeCount: campaign.resumeCount + 1,
        ...clearedReason,
      },
    })
    if (!row) {
      throw mmDeliveryError("mmInvalidState")
    }
    await this.audit("update", `resumed the marketing message "${row.name}"`)
    return row
  }

  /** Manual start for a campaign that predates delivery (`notSent`). */
  async send(input: {
    workspaceId: string
    id: string
  }): Promise<FacebookMarketingMessageModel> {
    const campaign = await this.load(input)
    if (campaign.status !== "notSent") {
      throw mmDeliveryError("mmInvalidState")
    }
    const grant = await this.resolveGrantToken(input.workspaceId)
    if (!grant) {
      throw mmDeliveryError("mmGrantInvalid")
    }

    let metaEndsAt = campaign.metaEndsAt
    try {
      const schedule = await getMessageCampaignSchedule({
        accessToken: grant.accessToken,
        campaignId: campaign.campaignId,
      })
      metaEndsAt = schedule.endTime
    } catch (error) {
      if (getGraphErrorCode(error) === GRAPH_ERROR_CODE_INVALID_TOKEN) {
        await facebookMarketingMessagesService.markAuthInvalid(
          input.workspaceId,
        )
        throw mmDeliveryError("mmGrantInvalid")
      }
      logger.warn(
        { err: error, campaignRowId: campaign.id },
        "Could not read the Meta campaign schedule before send",
      )
    }
    if (metaEndsAt && metaEndsAt <= new Date()) {
      throw mmDeliveryError("mmCampaignEnded")
    }

    const row = await facebookMarketingMessageRepository.transition({
      id: campaign.id,
      from: ["notSent"],
      patch: {
        status: "scheduled",
        startsAt: new Date(),
        metaEndsAt,
        ...clearedReason,
      },
    })
    if (!row) {
      throw mmDeliveryError("mmInvalidState")
    }
    await this.audit("update", `sent the marketing message "${row.name}"`)
    return row
  }

  async applyWebhook(
    event: MarketingMessageWebhookEvent,
  ): Promise<ApplyWebhookResult> {
    return await applyMarketingMessageWebhook(event)
  }

  async getStats(input: {
    workspaceId: string
    id: string
  }): Promise<MarketingMessageCampaignStats> {
    return await getMarketingMessageStats(input)
  }
}

export const facebookMarketingMessageDeliveryService =
  new FacebookMarketingMessageDeliveryService()
