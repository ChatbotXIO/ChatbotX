import { reflinkService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetReflinkRequest,
  ListReflinksRequest,
  ListReflinksResponse,
} from "../schema/query"
import type { ReflinkResource } from "../schema/resource"

export async function listReflinks(
  input: ListReflinksRequest,
): Promise<ListReflinksResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await reflinkService.list(input)
}

export async function findReflink(
  where: GetReflinkRequest,
): Promise<ReflinkResource | undefined> {
  return (await reflinkService.find(where)) ?? undefined
}
