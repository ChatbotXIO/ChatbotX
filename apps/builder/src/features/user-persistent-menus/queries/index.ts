import { userPersistentMenuService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListUserPersistentMenusRequest,
  ListUserPersistentMenusResponse,
} from "../schema/action"
import type { UserPersistentMenuResource } from "../schema/resource"

export async function listUserPersistentMenus(
  input: ListUserPersistentMenusRequest,
): Promise<ListUserPersistentMenusResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await userPersistentMenuService.listByWorkspace({
    workspaceId: input.workspaceId,
  })

  return { data }
}

export async function findUserPersistentMenu(input: {
  id: string
  workspaceId: string
}): Promise<UserPersistentMenuResource | undefined> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await userPersistentMenuService.find({
    id: input.id,
    workspaceId: input.workspaceId,
  })
}
