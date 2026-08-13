"use server"

import {
  buildContext,
  integrationFacebookAdsService,
} from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  type FacebookAdsAuthValue,
  facebookAdsAuthSchema,
  integration as facebookAdsIntegration,
} from "@chatbotx.io/integration-facebook-ads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

const retargetAdRequest = z
  .object({
    segment: z.enum(["conversations", "leads", "purchases"]),
    adId: z.string().trim().min(1).nullable().optional(),
    integrationWhatsappId: zodBigintAsString().optional(),
    since: z.string().trim().min(1),
    until: z.string().trim().min(1),
    adAccountId: z.string().trim().min(1),
    audienceName: z.string().trim().min(1).optional(),
    customAudienceId: z.string().trim().min(1).optional(),
  })
  .refine((input) => input.audienceName || input.customAudienceId, {
    message: "audienceName or customAudienceId is required",
    path: ["audienceName"],
  })

type RetargetAdRequest = z.infer<typeof retargetAdRequest>

function sanitizeJobIdPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_")
}

function buildRetargetJobId(input: {
  workspaceId: string
  customAudienceId: string
  segment: RetargetAdRequest["segment"]
  adId?: string | null
  integrationWhatsappId?: string
  since: string
  until: string
}): string {
  return [
    "ads-retarget",
    input.workspaceId,
    input.customAudienceId,
    input.segment,
    input.integrationWhatsappId ?? "all-accounts",
    input.since,
    input.until,
    input.adId ?? "all",
  ]
    .map(sanitizeJobIdPart)
    .join("-")
}

export const retargetAdAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(retargetAdRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: RetargetAdRequest
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      const row =
        await integrationFacebookAdsService.findByWorkspaceIdOrFail(workspaceId)
      const auth = await encryptUtils.decryptObject(
        encryptedDataSchema.parse(row.auth),
        facebookAdsAuthSchema,
      )
      const ctx = await buildContext<FacebookAdsAuthValue>({
        workspaceId,
        integrationType: "facebookAds",
        integration: { ...row, auth },
      })

      const customAudienceId =
        parsedInput.customAudienceId ??
        (
          await facebookAdsIntegration.runAction("createCustomAudience", {
            ctx,
            props: {
              adAccountId: parsedInput.adAccountId,
              name: parsedInput.audienceName ?? "",
            },
          })
        ).id

      await enqueueIntegrationJob(
        {
          type: IntegrationJobAction.syncRetargetAudience,
          data: {
            workspaceId,
            customAudienceId,
            segment: parsedInput.segment,
            adId: parsedInput.adId,
            integrationWhatsappId: parsedInput.integrationWhatsappId,
            since: parsedInput.since,
            until: parsedInput.until,
          },
        },
        {
          jobId: buildRetargetJobId({
            workspaceId,
            customAudienceId,
            segment: parsedInput.segment,
            adId: parsedInput.adId,
            integrationWhatsappId: parsedInput.integrationWhatsappId,
            since: parsedInput.since,
            until: parsedInput.until,
          }),
        },
      )

      return { customAudienceId, enqueued: true as const }
    },
  )
