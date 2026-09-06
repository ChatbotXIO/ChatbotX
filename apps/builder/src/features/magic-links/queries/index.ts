import { magicLinkService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListMagicLinksRequest,
  ListMagicLinksResponse,
} from "../schema/query"

export async function listMagicLinks(
  input: ListMagicLinksRequest,
): Promise<ListMagicLinksResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await magicLinkService.list(input)
}
