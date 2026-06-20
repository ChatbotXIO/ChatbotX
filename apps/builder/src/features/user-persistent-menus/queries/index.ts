import {
  findUserPersistentMenuById,
  listUserPersistentMenusByWorkspace,
  type UserPersistentMenuModel,
} from "@chatbotx.io/database/repositories"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListUserPersistentMenusRequest,
  ListUserPersistentMenusResponse,
} from "../schema/action"

export async function listUserPersistentMenus(
  input: ListUserPersistentMenusRequest,
): Promise<ListUserPersistentMenusResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await listUserPersistentMenusByWorkspace({
    workspaceId: input.workspaceId,
  })

  return { data }
}

export async function findUserPersistentMenu(input: {
  id: string
  workspaceId: string
}): Promise<UserPersistentMenuModel | undefined> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await findUserPersistentMenuById({
    id: input.id,
    workspaceId: input.workspaceId,
  })
}
