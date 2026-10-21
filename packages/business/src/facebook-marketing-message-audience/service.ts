import {
  facebookMarketingMessageAudienceRepository,
  facebookMarketingMessageRepository,
} from "@chatbotx.io/database/repositories"
import type { FacebookMarketingMessageAudienceModel } from "@chatbotx.io/database/types"
import {
  readTabularFile,
  TabularFileError,
  type TabularFormat,
} from "@chatbotx.io/imports/parsers"
import {
  AudienceUploadError,
  createMarketingMessagesAudience,
  deleteCustomAudience,
  FacebookAdsException,
  getMarketingMessagesAudiences,
  getNotificationMessageTokenAudienceIds,
  type MarketingMessagesAudience,
  uploadAudienceUsersSession,
} from "@chatbotx.io/integration-facebook-ads"
import {
  buildCustomerFilePayload,
  type CustomerFilePayload,
  mapCustomerFileHeaders,
} from "@chatbotx.io/integration-facebook-ads/customer-file"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { audienceError, isAudienceError } from "./errors"

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

const FORMAT_BY_EXTENSION: Record<string, TabularFormat> = {
  ".csv": "csv",
  ".txt": "csv",
  ".xlsx": "xlsx",
}

function formatOf(fileName: string): TabularFormat | undefined {
  const dot = fileName.lastIndexOf(".")
  return dot > 0
    ? FORMAT_BY_EXTENSION[fileName.slice(dot).toLowerCase()]
    : undefined
}

/**
 * Parse → map headers → normalize + hash, entirely before any Graph call
 * (spec D9). Plain PII only ever lives in this function's memory.
 */
async function readSource(
  source: AudienceUploadSource,
): Promise<AudienceUploadTable> {
  if ("rows" in source) {
    if (source.rows.length > AUDIENCE_MAX_ROWS) {
      throw audienceError("audienceTooManyRows", { max: AUDIENCE_MAX_ROWS })
    }
    return source
  }

  const format = formatOf(source.fileName)
  if (!format) {
    throw audienceError("audienceInvalidFile")
  }

  try {
    return await readTabularFile({
      format,
      buffer: source.buffer,
      maxRows: AUDIENCE_MAX_ROWS,
      maxBytes: AUDIENCE_MAX_FILE_BYTES,
    })
  } catch (error) {
    if (error instanceof TabularFileError && error.reason === "tooManyRows") {
      throw audienceError("audienceTooManyRows", { max: AUDIENCE_MAX_ROWS })
    }
    throw audienceError("audienceInvalidFile")
  }
}

async function preparePayload(
  source: AudienceUploadSource,
): Promise<CustomerFilePayload> {
  const table = await readSource(source)

  const mapped = mapCustomerFileHeaders(table.headers)
  if (!mapped.ok) {
    throw audienceError("audienceNoIdentifier")
  }
  const payload = buildCustomerFilePayload(table.rows, mapped.columns)
  if (payload.data.length === 0) {
    throw audienceError("audienceNoValidRows")
  }
  return payload
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

  async create(input: {
    workspaceId: string
    grant: AudienceGrant
    adAccountId: string
    pageId: string
    name: string
    description: string | null
    file: AudienceUploadSource
  }): Promise<AudienceUploadResult> {
    const payload = await preparePayload(input.file)

    let audience: Awaited<ReturnType<typeof createMarketingMessagesAudience>>
    try {
      audience = await createMarketingMessagesAudience({
        accessToken: input.grant.accessToken,
        adAccountId: input.adAccountId,
        pageId: input.pageId,
        name: input.name,
        description: input.description,
        version: input.grant.version,
      })
    } catch (error) {
      // A numeric Graph `code` means Meta answered with an HTTP error, so no
      // audience was created. Timeouts/network errors carry no such code and
      // stay thrown: the outcome is uncertain and the client locks.
      if (
        error instanceof FacebookAdsException &&
        typeof error.code === "number"
      ) {
        throw audienceError("audienceCreateRejected", { reason: error.message })
      }
      throw error
    }

    // From here an audience exists on Meta. ANY failure (row insert, upload,
    // counter) must surface as a partial upload so the caller never retries
    // `create` and spawns a second Meta audience; "Upload more rows" needs the
    // row, so a failed insert leaves an orphan that ops can find in the log.
    try {
      const row = await facebookMarketingMessageAudienceRepository.create({
        id: createId(),
        workspaceId: input.workspaceId,
        customAudienceId: audience.id,
        adAccountId: input.adAccountId,
        pageId: input.pageId,
        name: input.name,
        description: input.description,
        facebookUserId: input.grant.facebookUserId,
      })
      await this.audit(
        "create",
        `created the marketing messages audience "${input.name}"`,
      )

      return await this.upload(row, input.workspaceId, input.grant, payload)
    } catch (error) {
      if (isAudienceError(error)) {
        throw error
      }
      logger.error(
        {
          err: error,
          workspaceId: input.workspaceId,
          customAudienceId: audience.id,
        },
        "Marketing messages audience failed after it was created on Meta",
      )
      throw audienceError("audiencePartialUpload", { received: 0 })
    }
  }

  async uploadMore(input: {
    workspaceId: string
    grant: AudienceGrant
    id: string
    file: AudienceUploadSource
  }): Promise<AudienceUploadResult> {
    const row = await this.find({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw audienceError("audienceNotFound")
    }
    const payload = await preparePayload(input.file)
    return await this.upload(row, input.workspaceId, input.grant, payload)
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

  private async upload(
    row: Pick<FacebookMarketingMessageAudienceModel, "id" | "customAudienceId">,
    workspaceId: string,
    grant: AudienceGrant,
    payload: CustomerFilePayload,
  ): Promise<AudienceUploadResult> {
    try {
      const { received, invalid } = await uploadAudienceUsersSession({
        accessToken: grant.accessToken,
        customAudienceId: row.customAudienceId,
        schema: payload.schema,
        data: payload.data,
        version: grant.version,
      })
      await facebookMarketingMessageAudienceRepository.incrementRowsUploaded({
        id: row.id,
        workspaceId,
        by: received,
      })
      return {
        id: row.id,
        customAudienceId: row.customAudienceId,
        received,
        skipped: payload.skipped,
        invalid,
      }
    } catch (error) {
      if (!(error instanceof AudienceUploadError)) {
        throw error
      }
      if (error.received > 0) {
        // Must not mask the partial-upload error the caller depends on.
        try {
          await facebookMarketingMessageAudienceRepository.incrementRowsUploaded(
            { id: row.id, workspaceId, by: error.received },
          )
        } catch (incrementError) {
          logger.error(
            {
              err: incrementError,
              workspaceId,
              customAudienceId: row.customAudienceId,
            },
            "Failed to persist the partial audience upload count",
          )
        }
      }
      // Ids and counts only — never PII.
      logger.error(
        {
          // Message only: the cause chain may carry request bodies. The message
          // itself has access_token/appsecret_proof redacted by `rescue`.
          err: new Error(error.message),
          invalid: error.invalid,
          workspaceId,
          customAudienceId: row.customAudienceId,
          received: error.received,
        },
        "Marketing messages audience upload failed mid-session",
      )
      throw audienceError("audiencePartialUpload", { received: error.received })
    }
  }
}

export const facebookMarketingMessageAudienceService =
  new FacebookMarketingMessageAudienceService()
