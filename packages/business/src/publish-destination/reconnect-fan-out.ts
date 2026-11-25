import {
  type FanOutCandidate,
  type FanOutKind,
  MAX_FAN_OUT_PAGES_PER_QUERY,
  publishFanOutRepository,
} from "@chatbotx.io/database/repositories"
import { type EncryptedData, encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import {
  LowJobAction,
  type LowJobReconnectPublishFanOut,
  lowQueue,
} from "@chatbotx.io/worker-config"
import { z } from "zod"
import { connectionStateService } from "../connection/state-service"
import { instagramIntegrationService } from "../integration-instagram/service"
import { messengerIntegrationService } from "../integration-messenger/service"
import { logger } from "../logger"
import { publishDestinationService } from "./service"

/** Pages one inline run refreshes before the rest goes to the durable job. */
export const FAN_OUT_INLINE_MAX_ROWS = 100
/** Wall-clock budget of the inline run. */
export const FAN_OUT_INLINE_BUDGET_MS = 20_000
/** Pages one inline run looks at; later pages go straight to the job. */
export const FAN_OUT_INLINE_MAX_PAGES = 100
/** Continuations a fan-out may chain before it stops with a warning. */
export const FAN_OUT_MAX_HOPS = 10
/** Budget of one job run (it is not on a request path). */
const FAN_OUT_JOB_BUDGET_MS = 5 * 60_000

/** A Page the reconnecting person manages, with the Page token Graph returned. */
export type FanOutPage = {
  accessToken: string
  id: string
}

/** The Graph calls the fan-out needs, injected so this package stays free of channel code. */
export type FanOutOps = {
  /** Page token to a long-lived one, with the app credentials stored on the row. */
  exchangeLongLived: (input: {
    accessToken: string
    credential: { clientId: string; clientSecret: string; version: string }
  }) => Promise<string>
  /** Best effort: a failure is logged, never fails the row. */
  subscribeWebhook: (input: {
    accessToken: string
    kind: FanOutKind
    pageId: string
    version: string
  }) => Promise<void>
}

export type FanOutInput = {
  /**
   * When the reconnect that started this fan-out began: the authorization
   * generation. The page tokens and scopes in this input are that
   * authorization's snapshot. A row whose `updatedAt` is later was written by a
   * newer authorization and is never overwritten with it; a row this fan-out
   * writes is stamped with this very time (not now), so two overlapping
   * reconnects order by their start whichever job runs last. It travels with
   * every continuation job.
   */
  authorizedAt: Date
  clientId: string
  /** Permissions the reconnect saw (same person, same app); `null` when unknown. */
  grantedScopes: readonly string[] | null
  facebookUserId: string
  kinds: readonly FanOutKind[]
  pages: readonly FanOutPage[]
  /** The row the reconnect already refreshed itself. */
  selectedIntegrationId?: string
  workspaceId: string
}

export type FanOutResult = {
  failed: number
  /** Pages whose rows were not reached; the caller hands them to the job. */
  remaining: FanOutPage[]
  /** Whether a durable job was enqueued for `remaining`. */
  enqueued: boolean
  refreshed: number
}

type FanOutLimits = { budgetMs: number; maxRows: number }

const storedAuthSchema = z.looseObject({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  metadata: z.looseObject({ version: z.string().optional() }).optional(),
  tokens: z.looseObject({ accessToken: z.string().min(1) }),
  version: z.string().optional(),
})

const pagesBlobSchema = z.array(
  z.object({ accessToken: z.string().min(1), id: z.string().min(1) }),
)

const fanOutAad = (workspaceId: string, facebookUserId: string): string =>
  `reconnect-fan-out:${workspaceId}:${facebookUserId}`

const publisherKeyOf = (kind: FanOutKind): "facebook" | "instagramFacebook" =>
  kind === "messenger" ? "facebook" : "instagramFacebook"

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

/** Query parameters a Graph call carries that an error message may echo back. */
const SECRET_PARAM_PATTERN =
  /(access_token|fb_exchange_token|client_secret)=[^&\s"']+/g

/**
 * An error reduced to its name and a message with every token removed: the
 * Graph calls here carry the Page token and the app secret, and a fetch error
 * can quote the request URL.
 */
const safeError = (
  err: unknown,
  ...secrets: readonly string[]
): { message: string; name: string } => {
  const raw = err instanceof Error ? err.message : String(err)
  const scrubbed = secrets
    .filter((secret) => secret.length > 0)
    .reduce((text, secret) => text.split(secret).join("[redacted]"), raw)
  return {
    message: scrubbed.replace(SECRET_PARAM_PATTERN, "$1=[redacted]"),
    name: err instanceof Error ? err.name : "Error",
  }
}

/** Thrown inside the write transaction to roll it back when the row changed under the exchange. */
class CandidateChangedError extends Error {
  constructor() {
    super("reconnect fan-out candidate changed during the token exchange")
    this.name = "CandidateChangedError"
  }
}

type RowOutcome = "failed" | "refreshed" | "skipped"

class ReconnectFanOutService {
  /**
   * After one Facebook login reconnect committed, refreshes the other inbox
   * integrations of the same person: rows of this workspace only, stored with
   * the same app client id and whose stored authorizer is the reconnecting
   * Facebook user. Each row is its own transaction, one failure never fails the
   * others, nothing is ever inserted. Past the inline budget the rest goes to a
   * durable `low` job.
   */
  async fanOut(input: FanOutInput, ops: FanOutOps): Promise<FanOutResult> {
    // Bound the query input first: only the first pages are looked at inline.
    const inlinePages = input.pages.slice(0, FAN_OUT_INLINE_MAX_PAGES)
    const deferredPages = input.pages.slice(FAN_OUT_INLINE_MAX_PAGES)
    const result = await this.run({ ...input, pages: inlinePages }, ops, {
      budgetMs: FAN_OUT_INLINE_BUDGET_MS,
      maxRows: FAN_OUT_INLINE_MAX_ROWS,
    })
    const remaining = [...result.remaining, ...deferredPages]
    if (remaining.length === 0) {
      return result
    }
    const enqueued = await this.enqueueRemainder(input, remaining, 0)
    return { ...result, enqueued, remaining }
  }

  /** The job body: the same work and guards, with a larger budget and no re-enqueue. */
  async runJob(
    data: LowJobReconnectPublishFanOut["data"],
    ops: FanOutOps,
  ): Promise<FanOutResult> {
    const encrypted: EncryptedData = JSON.parse(data.encryptedPages)
    const pages = await encryptUtils.decryptObject(
      encrypted,
      pagesBlobSchema,
      fanOutAad(data.workspaceId, data.facebookUserId),
    )
    const input: FanOutInput = {
      authorizedAt: new Date(data.authorizedAt),
      clientId: data.clientId,
      facebookUserId: data.facebookUserId,
      grantedScopes: data.grantedScopes,
      kinds: data.kinds,
      pages,
      selectedIntegrationId: data.selectedIntegrationId,
      workspaceId: data.workspaceId,
    }
    const result = await this.run(input, ops, {
      budgetMs: FAN_OUT_JOB_BUDGET_MS,
      maxRows: Number.MAX_SAFE_INTEGER,
    })
    if (result.remaining.length === 0) {
      return result
    }
    // Out of budget: continue in a new job, bounded so it can never loop.
    const nextHop = data.hop + 1
    if (nextHop >= FAN_OUT_MAX_HOPS) {
      logger.warn(
        {
          hops: nextHop,
          pagesLeft: result.remaining.length,
          workspaceId: data.workspaceId,
        },
        "reconnect fan-out stopped at its hop limit with pages left",
      )
      return result
    }
    const enqueued = await this.enqueueRemainder(
      input,
      result.remaining,
      nextHop,
    )
    return { ...result, enqueued }
  }

  private async run(
    input: FanOutInput,
    ops: FanOutOps,
    limits: FanOutLimits,
  ): Promise<FanOutResult> {
    const startedAt = Date.now()
    const tokenByPage = new Map(
      input.pages.map((page) => [page.id, page.accessToken]),
    )
    const remainingIds = new Set<string>()
    const untouched: FanOutPage[] = []
    let refreshed = 0
    let failed = 0
    let handled = 0

    for (const pageChunk of chunk(input.pages, MAX_FAN_OUT_PAGES_PER_QUERY)) {
      if (Date.now() - startedAt >= limits.budgetMs) {
        untouched.push(...pageChunk)
        continue
      }
      const candidates = await publishFanOutRepository.findCandidates({
        clientId: input.clientId,
        excludeIntegrationId: input.selectedIntegrationId,
        facebookUserId: input.facebookUserId,
        kinds: input.kinds,
        limit: limits.maxRows + 1,
        pageIds: pageChunk.map((page) => page.id),
        workspaceId: input.workspaceId,
      })
      for (const candidate of candidates) {
        const outOfBudget =
          handled >= limits.maxRows || Date.now() - startedAt >= limits.budgetMs
        if (outOfBudget) {
          remainingIds.add(candidate.pageId)
          continue
        }
        handled += 1
        const token = tokenByPage.get(candidate.pageId)
        if (!token) {
          continue
        }
        const outcome = await this.refreshOne(input, candidate, token, ops)
        if (outcome === "refreshed") {
          refreshed += 1
        } else if (outcome === "failed") {
          failed += 1
        }
      }
    }

    const remaining = [
      ...untouched,
      ...[...remainingIds].flatMap((id) => {
        const accessToken = tokenByPage.get(id)
        return accessToken ? [{ accessToken, id }] : []
      }),
    ]
    return { enqueued: false, failed, refreshed, remaining }
  }

  private async refreshOne(
    input: FanOutInput,
    candidate: FanOutCandidate,
    pageToken: string,
    ops: FanOutOps,
  ): Promise<RowOutcome> {
    const log = {
      integrationId: candidate.id,
      kind: candidate.kind,
      workspaceId: input.workspaceId,
    }
    // Every secret this row handles, scrubbed from any logged error; grows as
    // the long-lived token and the stored app secret become known.
    const secrets: string[] = [pageToken]
    try {
      const stored = storedAuthSchema.parse(candidate.auth)
      secrets.push(stored.clientSecret)
      const version = stored.version ?? stored.metadata?.version ?? ""
      const longLived = await ops.exchangeLongLived({
        accessToken: pageToken,
        credential: {
          clientId: stored.clientId,
          clientSecret: stored.clientSecret,
          version,
        },
      })
      secrets.push(longLived)
      const auth = {
        ...stored,
        tokens: { ...stored.tokens, accessToken: longLived },
      }
      await connectionStateService.commitReconnect({
        auth: auth as AuthValue,
        inboxId: candidate.inboxId,
        workspaceId: input.workspaceId,
        writeAuth: async (tx) => {
          // The candidate was read before the token exchange: lock the row and
          // re-check it in this very transaction, so a disconnect or a newer
          // reconnect that landed meanwhile is never overwritten or revived.
          const unchanged =
            await publishFanOutRepository.lockUnchangedCandidate(
              {
                authorizedAt: input.authorizedAt,
                candidate,
                clientId: input.clientId,
                facebookUserId: input.facebookUserId,
                workspaceId: input.workspaceId,
              },
              tx,
            )
          if (!unchanged) {
            throw new CandidateChangedError()
          }
          if (candidate.kind === "messenger") {
            await messengerIntegrationService.updateAuth({
              auth,
              id: candidate.id,
              tx,
              updatedAt: input.authorizedAt,
              workspaceId: input.workspaceId,
            })
          } else {
            await instagramIntegrationService.updateAuth({
              auth,
              id: candidate.id,
              tx,
              updatedAt: input.authorizedAt,
              workspaceId: input.workspaceId,
            })
          }
          await publishDestinationService.captureInboxScopes(
            {
              grantedScopes: input.grantedScopes,
              inboxId: candidate.inboxId,
              publisherKey: publisherKeyOf(candidate.kind),
              workspaceId: input.workspaceId,
            },
            tx,
          )
        },
      })
      await ops
        .subscribeWebhook({
          accessToken: longLived,
          kind: candidate.kind,
          pageId: candidate.pageId,
          version,
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: safeError(err, ...secrets), ...log },
            "fan-out webhook subscribe failed",
          )
        })
      return "refreshed"
    } catch (err) {
      if (err instanceof CandidateChangedError) {
        logger.info(
          log,
          "reconnect fan-out row skipped: changed during exchange",
        )
        return "skipped"
      }
      logger.warn(
        { err: safeError(err, ...secrets), ...log },
        "reconnect fan-out row failed",
      )
      return "failed"
    }
  }

  private async enqueueRemainder(
    input: FanOutInput,
    remaining: readonly FanOutPage[],
    hop: number,
  ): Promise<boolean> {
    try {
      const encrypted = await encryptUtils.encryptObject(
        remaining.map((page) => ({
          accessToken: page.accessToken,
          id: page.id,
        })),
        fanOutAad(input.workspaceId, input.facebookUserId),
      )
      await lowQueue.add(
        LowJobAction.reconnectPublishFanOut,
        {
          data: {
            authorizedAt: input.authorizedAt.toISOString(),
            clientId: input.clientId,
            encryptedPages: JSON.stringify(encrypted),
            facebookUserId: input.facebookUserId,
            grantedScopes: input.grantedScopes
              ? [...input.grantedScopes]
              : null,
            hop,
            kinds: [...input.kinds],
            selectedIntegrationId: input.selectedIntegrationId,
            workspaceId: input.workspaceId,
          },
          type: LowJobAction.reconnectPublishFanOut,
        },
        {
          jobId: `reconnect-fan-out-${input.workspaceId}-${input.facebookUserId}-h${hop}`,
          // Re-driveable: a later reconnect must be able to enqueue again.
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
      return true
    } catch (err) {
      logger.error(
        {
          err: safeError(err, ...remaining.map((page) => page.accessToken)),
          workspaceId: input.workspaceId,
        },
        "failed to enqueue the reconnect fan-out remainder",
      )
      return false
    }
  }
}

export const reconnectFanOutService = new ReconnectFanOutService()
