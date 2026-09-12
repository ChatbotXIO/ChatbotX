"use server"

import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createLeadAdAutomation } from "../lib/create-automation"
import {
  type CreateFacebookLeadAdAutomationRequest,
  createFacebookLeadAdAutomationRequest,
} from "../schema/action"

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
      const t = await getTranslations()
      const automation = await createLeadAdAutomation({
        workspaceId,
        data: parsedInput,
        messages: {
          subscribeError: t("facebookLeadAdsAutomation.subscribeError"),
          duplicateError: t("facebookLeadAdsAutomation.duplicateError"),
        },
      })

      return { id: automation.id }
    },
  )
