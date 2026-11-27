import {
  facebookMarketingMessageAudienceRepository,
  facebookMarketingMessageRepository,
} from "@chatbotx.io/database/repositories"
import type { FacebookMarketingMessageAudienceModel } from "@chatbotx.io/database/types"
import {
  deleteCustomAudience,
  getMarketingMessagesAudiences,
  getNotificationMessageTokenAudienceIds,
  type MarketingMessagesAudience,
} from "@chatbotx.io/integration-facebook-ads"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { audienceError } from "./errors"

export const AUDIENCE_MAX_ROWS = 100_000
export const AUDIENCE_MAX_FILE_BYTES = 20 * 1024 * 1024

export type AudienceGrant = {
  accessToken: string
  version?: string
  facebookUserId: string | null
}

export type AudienceUploadFile = { fileName: string; buffer: Buffer }

/**
 * Already-parsed rows (the public API path). Replaces only the file parsing
 * step: header mapping, hashing and every limit below are the same.
 */
export type AudienceUploadTable = { headers: string[]; rows: string[][] }

export type AudienceUploadSource = AudienceUploadFile | AudienceUploadTable

export type AudienceUploadResult = {
  id: string
  customAudienceId: string
  received: number
  skipped: number
  invalid: number
}

export type AudienceLiveStatus = {
  lower: number | null
  upper: number | null
  deliveryStatus: { code: number; description: string } | null
  ready: boolean
  missingOnMeta: boolean
  pageDisconnected: boolean
}

/**
 * Supplied by the caller (it owns the Messenger integration lookup). `null`
 * means the Page is no longer connected.
 */
export type AudiencePageTokenResolver = (
  pageId: string,
) => Promise<{ accessToken: string; version?: string } | null>

const TOKEN_CHECK_CONCURRENCY = 5

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next]
        next += 1
        if (item !== undefined) {
          await fn(item)
        }
      }
    },
  )
  await Promise.all(workers)
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(key(item)) ?? []
    group.push(item)
    groups.set(key(item), group)
  }
  return groups
}

export type AudienceListFilter = {
  adAccountId?: string
  pageId?: string
  /** Only audiences whose subscription tokens exist (`readyAt` set). */
  readyOnly?: boolean
}

class FacebookMarketingMessageAudienceService extends BaseService {
  list(
    workspaceId: string,
    filter: AudienceListFilter = {},
  ): Promise<FacebookMarketingMessageAudienceModel[]> {
    return facebookMarketingMessageAudienceRepository.listByWorkspaceId(
      workspaceId,
      filter,
    )
  }

  find(input: {
    id: string
    workspaceId: string
  }): Promise<FacebookMarketingMessageAudienceModel | null> {
    return facebookMarketingMessageAudienceRepository.findForWorkspace(input)
  }

  async delete(input: {
    workspaceId: string
    grant: AudienceGrant
    id: string
  }): Promise<void> {
    const row = await this.find({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw audienceError("audienceNotFound")
    }
    // Checked BEFORE the Meta delete so a targeted audience is never removed
    // on Meta while our row survives. The `restrict` FK is the backstop.
    const usedBy = await facebookMarketingMessageRepository.countByAudienceId({
      audienceId: row.id,
      workspaceId: input.workspaceId,
    })
    if (usedBy > 0) {
      throw audienceError("audienceInUse", { count: usedBy })
    }
    // `notFound` (deleted in Ads Manager) still removes our row; any other
    // Graph error propagates and keeps it.
    await deleteCustomAudience({
      accessToken: input.grant.accessToken,
      customAudienceId: row.customAudienceId,
      version: input.grant.version,
    })
    await facebookMarketingMessageAudienceRepository.remove({
      id: row.id,
      workspaceId: input.workspaceId,
    })
    await this.audit(
      "delete",
      `deleted the marketing messages audience "${row.name}"`,
    )
  }

  /**
   * Live count/status per audience plus the subscription-token ready check
   * (spec §4.3). Partial Graph failures are logged and isolated to the
   * affected account or Page; this never throws for them.
   */
  async getLiveStatus(input: {
    workspaceId: string
    grant: AudienceGrant
    resolvePageToken: AudiencePageTokenResolver
  }): Promise<Record<string, AudienceLiveStatus>> {
    const rows = await this.list(input.workspaceId)
    if (rows.length === 0) {
      return {}
    }

    const metaById = new Map<string, MarketingMessagesAudience>()
    const failedAccounts = new Set<string>()
    await Promise.all(
      [...groupBy(rows, (row) => row.adAccountId).keys()].map(
        async (adAccountId) => {
          try {
            const audiences = await getMarketingMessagesAudiences({
              accessToken: input.grant.accessToken,
              adAccountId,
              version: input.grant.version,
            })
            for (const audience of audiences) {
              metaById.set(audience.id, audience)
            }
          } catch (error) {
            failedAccounts.add(adAccountId)
            logger.error(
              { err: error, workspaceId: input.workspaceId, adAccountId },
              "Failed to load marketing messages audiences",
            )
          }
        },
      ),
    )

    const result: Record<string, AudienceLiveStatus> = {}
    for (const row of rows) {
      const meta = metaById.get(row.customAudienceId)
      result[row.customAudienceId] = {
        lower: meta?.approximateCountLowerBound ?? null,
        upper: meta?.approximateCountUpperBound ?? null,
        deliveryStatus: meta?.deliveryStatus ?? null,
        ready: row.readyAt !== null,
        missingOnMeta: !(meta || failedAccounts.has(row.adAccountId)),
        pageDisconnected: false,
      }
    }

    const pending = rows.filter(
      (row) =>
        row.readyAt === null && !result[row.customAudienceId]?.missingOnMeta,
    )
    const newlyReady: string[] = []

    await Promise.all(
      [...groupBy(pending, (row) => row.pageId).entries()].map(
        async ([pageId, pageRows]) => {
          let page: Awaited<ReturnType<AudiencePageTokenResolver>>
          try {
            page = await input.resolvePageToken(pageId)
          } catch (error) {
            logger.error(
              { err: error, workspaceId: input.workspaceId, pageId },
              "Failed to resolve Page token for marketing messages audiences",
            )
            return
          }
          if (!page) {
            for (const row of pageRows) {
              const status = result[row.customAudienceId]
              if (status) {
                status.pageDisconnected = true
              }
            }
            return
          }
          const { accessToken, version } = page

          await mapWithConcurrency(
            pageRows,
            TOKEN_CHECK_CONCURRENCY,
            async (row) => {
              try {
                const ids = await getNotificationMessageTokenAudienceIds({
                  pageAccessToken: accessToken,
                  pageId,
                  customAudienceId: row.customAudienceId,
                  version: version ?? input.grant.version,
                })
                const status = result[row.customAudienceId]
                if (status && ids.includes(row.customAudienceId)) {
                  status.ready = true
                  newlyReady.push(row.id)
                }
              } catch (error) {
                logger.error(
                  {
                    err: error,
                    workspaceId: input.workspaceId,
                    pageId,
                    customAudienceId: row.customAudienceId,
                  },
                  "Marketing messages audience token check failed",
                )
              }
            },
          )
        },
      ),
    )

    if (newlyReady.length > 0) {
      try {
        await facebookMarketingMessageAudienceRepository.markReady({
          ids: newlyReady,
          workspaceId: input.workspaceId,
          readyAt: new Date(),
        })
      } catch (error) {
        // Persistence is an optimisation; the live status is still correct.
        logger.error(
          {
            err: error,
            workspaceId: input.workspaceId,
            count: newlyReady.length,
          },
          "Failed to persist marketing messages audience ready state",
        )
      }
    }

    return result
  }
}

export const facebookMarketingMessageAudienceService =
  new FacebookMarketingMessageAudienceService()
