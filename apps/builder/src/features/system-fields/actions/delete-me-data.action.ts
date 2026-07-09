"use server"

import { systemFieldService } from "@chatbotx.io/business/system-field"
import { actionClient } from "@/lib/safe-action"
import {
  type MeLinkInput,
  meLinkInputSchema,
  toMePrivacyParams,
} from "../lib/me-link-params"

export const deleteMeDataAction = actionClient
  .inputSchema(meLinkInputSchema)
  .action(handleDeleteMeData)

export async function handleDeleteMeData({
  parsedInput,
}: {
  parsedInput: MeLinkInput
}) {
  await systemFieldService.deleteMeData(toMePrivacyParams(parsedInput))
  return null
}
