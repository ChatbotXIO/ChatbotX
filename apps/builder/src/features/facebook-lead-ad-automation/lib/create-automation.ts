import "server-only"

import { facebookLeadAdsAutomationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { FacebookLeadAdsAutomationModel } from "@chatbotx.io/database/types"
import { logger } from "@/lib/log"
import type { CreateFacebookLeadAdAutomationRequest } from "../schema/action"
import { subscribePageLeadgen } from "./pages"

export async function createLeadAdAutomation(input: {
  workspaceId: string
  data: CreateFacebookLeadAdAutomationRequest
  messages: { subscribeError: string; duplicateError: string }
}): Promise<FacebookLeadAdsAutomationModel> {
  const { workspaceId, data, messages } = input

  // Subscribe before persisting: an automation whose page never delivers
  // `leadgen` webhooks would sit at zero leads with nothing to distinguish
  // it from a working one, so a failure here must block the create.
  try {
    await subscribePageLeadgen(workspaceId, data.pageId)
  } catch (error) {
    logger.error(
      { err: error, workspaceId, pageId: data.pageId },
      "createLeadAdAutomation: failed to subscribe page to leadgen",
    )
    throw new ChatbotXException(messages.subscribeError)
  }

  return await facebookLeadAdsAutomationService.create({
    workspaceId,
    name: data.name,
    pageId: data.pageId,
    pageName: data.pageName ?? null,
    formId: data.formId,
    formName: data.formName ?? null,
    fieldMapping: data.fieldMapping,
    flowId: data.flowId ?? null,
    duplicateMessage: messages.duplicateError,
  })
}
