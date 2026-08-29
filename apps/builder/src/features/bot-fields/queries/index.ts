import { botFieldService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListBotFieldsRequest,
  ListBotFieldsResponse,
} from "../schemas/query"

/**
 * Documented hard cap for the Account Fields card on `/custom-fields`: the
 * card is a single client-driven table (see `AccountFieldsCard`), fetched
 * once via RSC and searched/paginated in the browser, so we fetch "all" bot
 * fields up to this cap rather than paging through the API.
 */
export const ACCOUNT_FIELDS_HARD_CAP = 500

export const listBotFieldsRSC = async (
  input: ListBotFieldsRequest & { workspaceId: string },
): Promise<ListBotFieldsResponse> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return botFieldService.list({
    ...input,
    // Stable name ordering: without an explicit sort Postgres returns heap
    // order, which shifts every time a row is UPDATEd (e.g. a flow step
    // writing a value) — the card would visibly reshuffle after each save.
    sort: input.sort ?? [{ id: "name", desc: false }],
  })
}
