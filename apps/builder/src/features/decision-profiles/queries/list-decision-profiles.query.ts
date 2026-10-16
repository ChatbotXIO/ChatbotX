import { decisionProfileService } from "@chatbotx.io/business"
import type { ListDecisionProfilesRequest } from "../schema/query"

export const listDecisionProfiles = async (
  input: ListDecisionProfilesRequest,
) =>
  await decisionProfileService.listForSettings({
    ...input,
    name: input.name ?? undefined,
  })
