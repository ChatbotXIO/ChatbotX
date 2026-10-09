import {
  googleAdsConversionService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import type { IntegrationJobSendGoogleAdsConversion } from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { isFinalAttempt } from "../../../lib/job-attempts"
import { resolveMatchingTemplates } from "./resolve-matching-templates"

type SendGoogleAdsConversionData = IntegrationJobSendGoogleAdsConversion["data"]

export async function handleSendGoogleAdsConversion(
  data: SendGoogleAdsConversionData,
  job: Job,
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    await googleAdsConversionService.deliver({
      eventId: data.googleAdsConversionEventId,
      workspaceId: data.workspaceId,
      attempt: data.attempt,
      isLastInJobAttempt: isFinalAttempt(job),
      resolveMatchingTemplates,
    })
  })
}
