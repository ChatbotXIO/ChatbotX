import {
  adsConversionService,
  buildContext,
  integrationFacebookAdsService,
  withBlockedOwnerGuard,
  workspaceService,
} from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  type FacebookAdsAuthValue,
  facebookAdsAuthSchema,
  GRAPH_ERROR_CODE_INVALID_TOKEN,
  getGraphErrorCode,
  integration as integrationFacebookAds,
} from "@chatbotx.io/integration-facebook-ads"
import type { AdsConversionJobSyncRetargetAudience } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"

type SyncRetargetAudienceData = AdsConversionJobSyncRetargetAudience["data"]
type FacebookAdsContext = Awaited<
  ReturnType<typeof buildContext<FacebookAdsAuthValue>>
>
type RetargetContact = { email?: string | null; phoneNumber?: string | null }

const RETARGET_CONTACT_PAGE_SIZE = 500
const META_AUDIENCE_BATCH_SIZE = 5000

function isRetryableFacebookAdsError(error: unknown): boolean {
  if (
    error instanceof Error &&
    "isRetryable" in error &&
    error.isRetryable === true
  ) {
    return true
  }

  if (
    error instanceof Error &&
    "httpStatusCode" in error &&
    typeof error.httpStatusCode === "number"
  ) {
    return error.httpStatusCode === 429 || error.httpStatusCode >= 500
  }

  return false
}

async function flushBatch(input: {
  ctx: FacebookAdsContext
  customAudienceId: string
  contacts: RetargetContact[]
  fallbackCountry?: string | null
}): Promise<{ received: number; batches: number }> {
  if (input.contacts.length === 0) {
    return { received: 0, batches: 0 }
  }

  return await integrationFacebookAds.runAction("bulkSyncHashedAudienceUsers", {
    ctx: input.ctx,
    props: {
      customAudienceId: input.customAudienceId,
      operation: "add",
      contacts: input.contacts,
      fallbackCountry: input.fallbackCountry,
    },
  })
}

async function buildSyncRetargetAudienceContext(
  data: SyncRetargetAudienceData,
) {
  const [row, workspace] = await Promise.all([
    integrationFacebookAdsService.findByWorkspaceIdOrFail(data.workspaceId),
    workspaceService.findById({ id: data.workspaceId }),
  ])
  const auth = await encryptUtils.decryptObject(
    encryptedDataSchema.parse(row.auth),
    facebookAdsAuthSchema,
  )
  const ctx = await buildContext<FacebookAdsAuthValue>({
    workspaceId: data.workspaceId,
    integrationType: "facebookAds",
    integration: { ...row, auth },
  })

  return { ctx, workspace }
}

async function syncRetargetAudiencePages(input: {
  data: SyncRetargetAudienceData
  ctx: FacebookAdsContext
  fallbackCountry?: string | null
}): Promise<{ received: number; batches: number }> {
  let afterId: string | undefined
  let pendingContacts: RetargetContact[] = []
  let totalReceived = 0
  let totalBatches = 0

  for (;;) {
    const rows = await adsConversionService.listRetargetContacts({
      workspaceId: input.data.workspaceId,
      segment: input.data.segment,
      adId: input.data.adId,
      integrationWhatsappId: input.data.integrationWhatsappId,
      since: input.data.since,
      until: input.data.until,
      afterId,
      limit: RETARGET_CONTACT_PAGE_SIZE,
    })

    pendingContacts.push(
      ...rows.map((row) => ({
        email: row.email,
        phoneNumber: row.phoneNumber,
      })),
    )

    while (pendingContacts.length >= META_AUDIENCE_BATCH_SIZE) {
      const contacts = pendingContacts.slice(0, META_AUDIENCE_BATCH_SIZE)
      pendingContacts = pendingContacts.slice(META_AUDIENCE_BATCH_SIZE)
      const result = await flushBatch({
        ctx: input.ctx,
        customAudienceId: input.data.customAudienceId,
        contacts,
        fallbackCountry: input.fallbackCountry,
      })
      totalReceived += result.received
      totalBatches += result.batches
      logger.info(
        {
          workspaceId: input.data.workspaceId,
          customAudienceId: input.data.customAudienceId,
          received: totalReceived,
          batches: totalBatches,
        },
        "Synced CTWA retarget audience batch",
      )
    }

    afterId = rows.at(-1)?.id
    if (rows.length < RETARGET_CONTACT_PAGE_SIZE || !afterId) {
      break
    }
  }

  const result = await flushBatch({
    ctx: input.ctx,
    customAudienceId: input.data.customAudienceId,
    contacts: pendingContacts,
    fallbackCountry: input.fallbackCountry,
  })
  totalReceived += result.received
  totalBatches += result.batches

  return { received: totalReceived, batches: totalBatches }
}

async function handleSyncRetargetAudienceError(
  data: SyncRetargetAudienceData,
  error: unknown,
): Promise<void> {
  if (getGraphErrorCode(error) === GRAPH_ERROR_CODE_INVALID_TOKEN) {
    await integrationFacebookAdsService.markInvalid(data.workspaceId)
    logger.error(
      {
        workspaceId: data.workspaceId,
        customAudienceId: data.customAudienceId,
        err: normalizeError(error),
      },
      "Stopped CTWA retarget audience sync because Facebook Ads auth is invalid",
    )
    return
  }

  if (isRetryableFacebookAdsError(error)) {
    throw error
  }

  logger.error(
    {
      workspaceId: data.workspaceId,
      customAudienceId: data.customAudienceId,
      err: normalizeError(error),
    },
    "Stopped CTWA retarget audience sync after terminal Facebook Ads error",
  )
}

export async function handleSyncRetargetAudience(
  data: SyncRetargetAudienceData,
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const { ctx, workspace } = await buildSyncRetargetAudienceContext(data)
    let totals: { received: number; batches: number }

    try {
      totals = await syncRetargetAudiencePages({
        data,
        ctx,
        fallbackCountry: workspace?.targetCountry,
      })
    } catch (error) {
      await handleSyncRetargetAudienceError(data, error)
      return
    }

    logger.info(
      {
        workspaceId: data.workspaceId,
        customAudienceId: data.customAudienceId,
        received: totals.received,
        batches: totals.batches,
      },
      "Completed CTWA retarget audience sync",
    )
  })
}
