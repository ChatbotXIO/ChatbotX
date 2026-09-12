import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { MessengerPersistentMenu } from "@chatbotx.io/database/partials"
import {
  createUserPersistentMenu,
  deleteUserPersistentMenus,
  findUserPersistentMenuById,
  listUserPersistentMenusByWorkspace,
  type UserPersistentMenuModel,
  updateUserPersistentMenu,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

class UserPersistentMenuService extends BaseService {
  listByWorkspace(input: {
    workspaceId: string
  }): Promise<UserPersistentMenuModel[]> {
    return listUserPersistentMenusByWorkspace({
      workspaceId: input.workspaceId,
    })
  }

  find(input: {
    id: string
    workspaceId: string
  }): Promise<UserPersistentMenuModel | undefined> {
    return findUserPersistentMenuById({
      id: input.id,
      workspaceId: input.workspaceId,
    })
  }

  async findOrFail(input: {
    id: string
    workspaceId: string
  }): Promise<UserPersistentMenuModel> {
    const menu = await this.find(input)
    if (!menu) {
      throw notFoundException("User persistent menu not found")
    }
    return menu
  }

  async create(input: {
    workspaceId: string
    name: string
    menus: MessengerPersistentMenu[]
    tx?: DatabaseClient
  }): Promise<UserPersistentMenuModel> {
    const created = await createUserPersistentMenu(
      {
        workspaceId: input.workspaceId,
        name: input.name,
        menus: input.menus,
      },
      input.tx,
    )
    if (!created) {
      throw new ChatbotXException("Failed to create user persistent menu")
    }
    return created
  }

  async update(input: {
    id: string
    workspaceId: string
    name: string
    menus: MessengerPersistentMenu[]
    tx?: DatabaseClient
  }): Promise<UserPersistentMenuModel> {
    const updated = await updateUserPersistentMenu(
      {
        id: input.id,
        workspaceId: input.workspaceId,
        name: input.name,
        menus: input.menus,
      },
      input.tx,
    )
    if (!updated) {
      throw notFoundException("User persistent menu not found")
    }
    return updated
  }

  async delete(input: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { deletedIds } = await deleteUserPersistentMenus(
      { workspaceId: input.workspaceId, ids: input.ids },
      input.tx,
    )

    // A single-id delete (the public `DELETE /v1/user-persistent-menus/{id}`
    // handler, and any other single-resource caller) must 404 on a
    // nonexistent or cross-workspace id, matching `get`/`update` on the same
    // resource — otherwise it silently returns 204 for nothing. A bulk
    // delete legitimately expects some ids to already be gone (the private
    // bulk-delete action), so this only fires when exactly one id was asked
    // for and none were affected.
    if (input.ids.length === 1 && deletedIds.length === 0) {
      throw notFoundException("User persistent menu not found")
    }
  }
}

export const userPersistentMenuService = new UserPersistentMenuService()
