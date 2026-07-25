"use server"

import { facebookLeadAdsAutomationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { subscribePageLeadgen } from "../lib/pages"
import {
  type CreateFacebookLeadAdAutomationRequest,
  createFacebookLeadAdAutomationRequest,
} from "../schemas/action"

export const createFacebookLeadAdAutomationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFacebookLeadAdAutomationRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateFacebookLeadAdAutomationRequest
    }) => {
      // Subscribe before persisting: an automation whose page never delivers
      // `leadgen` webhooks would sit at zero leads with nothing to distinguish
      // it from a working one, so a failure here must block the create.
      try {
        await subscribePageLeadgen(workspaceId, parsedInput.pageId)
      } catch (error) {
        logger.error(
          { err: error, workspaceId, pageId: parsedInput.pageId },
          "createFacebookLeadAdAutomationAction: failed to subscribe page to leadgen",
        )
        const t = await getTranslations()
        throw new ChatbotXException(
          t("facebookLeadAdsAutomation.subscribeError"),
        )
      }

      try {
        const automation = await facebookLeadAdsAutomationService.create({
          workspaceId,
          name: parsedInput.name,
          pageId: parsedInput.pageId,
          pageName: parsedInput.pageName ?? null,
          formId: parsedInput.formId,
          formName: parsedInput.formName ?? null,
          fieldMapping: parsedInput.fieldMapping,
          flowId: parsedInput.flowId ?? null,
        })

        return { id: automation.id }
      } catch (error) {
        if (isUniqueViolationError(error)) {
          const t = await getTranslations()
          throw new ChatbotXException(
            t("facebookLeadAdsAutomation.duplicateError"),
          )
        }
        throw error
      }
    },
  )
