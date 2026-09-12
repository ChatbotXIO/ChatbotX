import { userPersistentMenuService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createUserPersistentMenuPublicRequest,
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
    .input(publicListRequest)
    .output(publicListResponse(userPersistentMenuPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await userPersistentMenuService.listByWorkspace({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(data, input)
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/user-persistent-menus/{id}",
      summary: "Get a user persistent menu by id",
      tags: ["User Persistent Menus"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(userPersistentMenuPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await userPersistentMenuService.findOrFail({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

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
    .handler(
      async ({ context, input }) =>
        await userPersistentMenuService.create({
          workspaceId: context.workspace.id,
          name: input.name,
          menus: input.persistentMenus,
        }),
    ),

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
    .handler(
      async ({ context, input }) =>
        await userPersistentMenuService.update({
          workspaceId: context.workspace.id,
          id: input.id,
          name: input.name,
          menus: input.persistentMenus,
        }),
    ),

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
      await userPersistentMenuService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
