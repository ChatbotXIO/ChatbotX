import { notFoundException } from "@chatbotx.io/business/errors"
import {
  createUserPersistentMenu,
  deleteUserPersistentMenus,
  listUserPersistentMenusByWorkspace,
  updateUserPersistentMenu,
} from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createUserPersistentMenuPublicRequest,
  listUserPersistentMenusPublicResponse,
  updateUserPersistentMenuPublicRequest,
  userPersistentMenuPublicResource,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const userPersistentMenusPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/user-persistent-menus",
      summary: "List user persistent menus",
      tags: ["User Persistent Menus"],
    })
    .output(listUserPersistentMenusPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => {
      const data = await listUserPersistentMenusByWorkspace({
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/user-persistent-menus",
      summary: "Create a user persistent menu",
      successStatus: 201,
      tags: ["User Persistent Menus"],
    })
    .input(createUserPersistentMenuPublicRequest)
    .output(userPersistentMenuPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const created = await createUserPersistentMenu({
        workspaceId: context.workspace.id,
        name: input.name,
        menus: input.persistentMenus,
      })
      if (!created) {
        throw new Error("Failed to create user persistent menu")
      }
      return created
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/user-persistent-menus/{id}",
      summary: "Update a user persistent menu",
      tags: ["User Persistent Menus"],
    })
    .input(updateUserPersistentMenuPublicRequest)
    .output(userPersistentMenuPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const updated = await updateUserPersistentMenu({
        workspaceId: context.workspace.id,
        id: input.id,
        name: input.name,
        menus: input.persistentMenus,
      })
      if (!updated) {
        throw notFoundException("User persistent menu not found")
      }
      return updated
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/user-persistent-menus/{id}",
      summary: "Delete a user persistent menu",
      successStatus: 204,
      tags: ["User Persistent Menus"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteUserPersistentMenus({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
