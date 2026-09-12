import { tagService } from "@chatbotx.io/business"
import type {
  ListContactTagsRequest,
  ListContactTagsResponse,
} from "../schema/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest,
): Promise<ListContactTagsResponse> {
  const data = await tagService.listForContact(input)

  return {
    data,
  }
}
