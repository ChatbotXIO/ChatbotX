import { adsConversionChannelSchema } from "@chatbotx.io/database/schema"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { z } from "zod"
import { adsConversionExportSegments } from "../ads-conversion"
import {
  buildFacebookAdsContext,
  facebookAdsIntegration,
} from "../integration-facebook-ads/graph-reads"

function sanitizeJobIdPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_")
}

/**
 * Base shape, exported unrefined: zod v4 rejects `.omit()` on a schema that
 * already carries a `.refine()`, so the private action (which needs the
 * same shape minus `workspaceId`, re-refined) must start from this rather
 * than from {@link startRetargetAudienceSyncInput} itself.
 */
export const startRetargetAudienceSyncShape = z.object({
  workspaceId: z.string(),
  segment: adsConversionExportSegments.describe(
    "Conversion funnel stage to build the audience from.",
  ),
  adId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .describe("Restrict to this ad id."),
  channel: adsConversionChannelSchema
    .optional()
    .describe("Restrict to this channel."),
  integrationWhatsappId: z
    .string()
    .optional()
    .describe("Restrict to this WhatsApp integration."),
  integrationMessengerId: z
    .string()
    .optional()
    .describe("Restrict to this Messenger integration."),
  integrationInstagramId: z
    .string()
    .optional()
    .describe("Restrict to this Instagram integration."),
  since: z.coerce
    .date()
    .describe("ISO 8601 start of the date range (inclusive)."),
  until: z.coerce
    .date()
    .describe("ISO 8601 end of the date range (inclusive)."),
  adAccountId: z
    .string()
    .trim()
    .min(1)
    .describe("Meta ad account id (act_<id>) to sync the audience to."),
  audienceName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Name for a new custom audience. Provide this or customAudienceId, not both.",
    ),
  customAudienceId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Existing custom audience id to sync into. Provide this or audienceName, not both.",
    ),
})

export const startRetargetAudienceSyncInput =
  startRetargetAudienceSyncShape.refine(
    (input) => input.audienceName || input.customAudienceId,
    {
      message: "Either audienceName or customAudienceId is required",
      path: ["audienceName"],
    },
  )

type StartRetargetAudienceSyncInput = z.infer<
  typeof startRetargetAudienceSyncInput
>

function buildRetargetJobId(input: {
  workspaceId: string
  customAudienceId: string
  segment: StartRetargetAudienceSyncInput["segment"]
  adId?: string | null
  integrationWhatsappId?: string
  channel?: StartRetargetAudienceSyncInput["channel"]
  integrationMessengerId?: string
  integrationInstagramId?: string
  since: string
  until: string
}): string {
  const accountKey =
    input.integrationMessengerId ??
    input.integrationInstagramId ??
    input.integrationWhatsappId ??
    "all-accounts"

  return [
    "ads-retarget",
    input.workspaceId,
    input.customAudienceId,
    input.segment,
    input.channel ?? "whatsapp",
    accountKey,
    input.since,
    input.until,
    input.adId ?? "all",
  ]
    .map(sanitizeJobIdPart)
    .join("-")
}

class AdsRetargetService {
  /**
   * Resolves (or creates) the Facebook custom audience for the requested
   * segment, then enqueues the worker's `syncRetargetAudience` job that
   * actually populates it. Shared by the private `retargetAdAction` and the
   * public `POST /v1/ads/retarget-audiences` endpoint — see
   * `.agents/rules/data-access.md`'s "public API and private paths share
   * one service method".
   */
  async startAudienceSync(
    input: z.input<typeof startRetargetAudienceSyncInput>,
  ): Promise<{ customAudienceId: string; enqueued: true }> {
    const parsed = startRetargetAudienceSyncInput.parse(input)
    const ctx = await buildFacebookAdsContext(parsed.workspaceId)

    const customAudienceId =
      parsed.customAudienceId ??
      (
        await facebookAdsIntegration.runAction("createCustomAudience", {
          ctx,
          props: {
            adAccountId: parsed.adAccountId,
            name: parsed.audienceName ?? "",
          },
        })
      ).id

    const since = parsed.since.toISOString()
    const until = parsed.until.toISOString()

    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.syncRetargetAudience,
        data: {
          workspaceId: parsed.workspaceId,
          customAudienceId,
          segment: parsed.segment,
          adId: parsed.adId,
          integrationWhatsappId: parsed.integrationWhatsappId,
          channel: parsed.channel,
          integrationMessengerId: parsed.integrationMessengerId,
          integrationInstagramId: parsed.integrationInstagramId,
          since,
          until,
        },
      },
      {
        jobId: buildRetargetJobId({
          workspaceId: parsed.workspaceId,
          customAudienceId,
          segment: parsed.segment,
          adId: parsed.adId,
          integrationWhatsappId: parsed.integrationWhatsappId,
          channel: parsed.channel,
          integrationMessengerId: parsed.integrationMessengerId,
          integrationInstagramId: parsed.integrationInstagramId,
          since,
          until,
        }),
      },
    )

    return { customAudienceId, enqueued: true as const }
  }
}

export const adsRetargetService = new AdsRetargetService()
