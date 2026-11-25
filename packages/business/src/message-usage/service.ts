import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceService } from "../workspace/service"
import { workspaceBotMessageUsageService } from "../workspace-bot-message-usage/service"
import { workspaceUsageService } from "../workspace-usage/service"

/** The error code of an action refused because the owner's message quota is used up. */
export const MESSAGE_QUOTA_EXCEEDED = "postMessageQuotaExceeded"

/**
 * The owner's message quota (`botMessages` lifetime + `monthlyBotMessages` per
 * billing period, on the owner's `UserQuota`; invariant 12) shared by every
 * action that consumes messages outside a chat send: Marketing Messages and the
 * Posts actions (publishing, per-post comment settings, downloads).
 *
 * Same rules as the chat send gate: a workspace without a resolvable owner is
 * not attributed (fail open), a plan without a limit never blocks, and the
 * charge comes after the action succeeded. Callers make a charge idempotent
 * with their own durable marker; this service only counts.
 */
class MessageUsageService {
  /** Whether the owner can still consume a message (either limit reached → false). */
  async hasRoom(workspaceId: string): Promise<boolean> {
    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace?.ownerId) {
      return true
    }
    const [monthlyAtLimit, lifetimeAtLimit] = await Promise.all([
      quotaEnforcementService.isAtLimit({
        metric: "monthlyBotMessages",
        userId: workspace.ownerId,
      }),
      quotaEnforcementService.isAtLimit({
        metric: "botMessages",
        userId: workspace.ownerId,
      }),
    ])
    return !(monthlyAtLimit || lifetimeAtLimit)
  }

  /** Throws a 429 `postMessageQuotaExceeded` when the owner has no message left. */
  async assertRoom(workspaceId: string): Promise<void> {
    if (await this.hasRoom(workspaceId)) {
      return
    }
    throw new ChatbotXException(
      "The message quota of this account is used up. Upgrade the plan or wait for the next billing period.",
      MESSAGE_QUOTA_EXCEEDED,
      429,
    )
  }

  /**
   * Counts `count` messages exactly like a chat send: the owner pool (lifetime
   * and monthly, tenant-aware), the workspace's display counter, and the
   * per-period workspace ledger.
   *
   * Throws only when nothing was counted (the workspace could not be read), so
   * a caller may then release its marker and retry. Once the first counter is
   * written a failing counter is logged and skipped, never thrown: a retry
   * would count the counters that already moved a second time. The rule is
   * "never charge twice; an error may under-count".
   */
  async charge(input: { workspaceId: string; count: number }): Promise<void> {
    if (input.count <= 0) {
      return
    }
    const workspace = await workspaceService.findById({ id: input.workspaceId })
    const counters: readonly ChargeCounter[] = [
      {
        name: "botMessages",
        run: () =>
          quotaEnforcementService.incrementBy({
            count: input.count,
            metric: "botMessages",
            userId: workspace.ownerId,
          }),
      },
      {
        name: "monthlyBotMessages",
        run: () =>
          quotaEnforcementService.incrementBy({
            count: input.count,
            metric: "monthlyBotMessages",
            userId: workspace.ownerId,
          }),
      },
      {
        name: "workspaceUsage",
        run: () =>
          workspaceUsageService.increment(
            input.workspaceId,
            "botMessages",
            input.count,
          ),
      },
      {
        name: "periodLedger",
        run: () =>
          workspaceBotMessageUsageService.increment({
            count: input.count,
            ownerId: workspace.ownerId,
            tenantId: workspace.tenantId,
            workspaceId: input.workspaceId,
          }),
      },
    ]
    for (const counter of counters) {
      try {
        await counter.run()
      } catch (err) {
        logger.error(
          {
            count: input.count,
            counter: counter.name,
            err,
            workspaceId: input.workspaceId,
          },
          "message usage counter write failed, the charge is not repeated",
        )
      }
    }
  }
}

interface ChargeCounter {
  name: string
  run: () => Promise<unknown>
}

export const messageUsageService = new MessageUsageService()
