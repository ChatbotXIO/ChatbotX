import {
  adsConversionService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import type { AdsConversionJobEvaluateTemplateSent } from "@chatbotx.io/worker-config"

type EvaluateTemplateSentData = AdsConversionJobEvaluateTemplateSent["data"]

export async function handleEvaluateTemplateSent(
  data: EvaluateTemplateSentData,
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    await adsConversionService.evaluateTemplateSent(data)
  })
}
