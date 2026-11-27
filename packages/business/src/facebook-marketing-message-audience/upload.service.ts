/**
 * Audience create/upload: parses the file and hashes every row with
 * `node:crypto`, so this module is Node-only. It is a separate subpath
 * (`@chatbotx.io/business/facebook-marketing-message-audience/upload`), not part
 * of the module index, because the builder's oRPC router reaches the read
 * service and Next.js traces that graph into the Edge instrumentation bundle
 * (AGENTS.md invariant 25). Only server actions and the public API import it.
 */
import { facebookMarketingMessageAudienceRepository } from "@chatbotx.io/database/repositories"
import type { FacebookMarketingMessageAudienceModel } from "@chatbotx.io/database/types"
import {
  readTabularFile,
  TabularFileError,
  type TabularFormat,
} from "@chatbotx.io/imports/parsers"
import {
  AudienceUploadError,
  createMarketingMessagesAudience,
  FacebookAdsException,
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
import {
  AUDIENCE_MAX_FILE_BYTES,
  AUDIENCE_MAX_ROWS,
  type AudienceGrant,
  type AudienceUploadResult,
  type AudienceUploadSource,
  type AudienceUploadTable,
  facebookMarketingMessageAudienceService,
} from "./service"

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

class FacebookMarketingMessageAudienceUploadService extends BaseService {
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
    const row = await facebookMarketingMessageAudienceService.find({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw audienceError("audienceNotFound")
    }
    const payload = await preparePayload(input.file)
    return await this.upload(row, input.workspaceId, input.grant, payload)
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

export const facebookMarketingMessageAudienceUploadService =
  new FacebookMarketingMessageAudienceUploadService()
