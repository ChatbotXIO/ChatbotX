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
      description:
        "Use this to find persistent menu ids before inspecting one with `userPersistentMenus.get` or changing one with `userPersistentMenus.update`. Returns persistent menus in this workspace.",
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
      summary: "Get user persistent menu",
      description:
        "Returns one persistent menu's items. Use `userPersistentMenus.list` to find its id first.",
      tags: ["User Persistent Menus"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "User persistent menu id. Get it from `userPersistentMenus.list`.",
        ),
      }),
    )
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
      summary: "Create user persistent menu",
      description:
        "Adds a persistent menu of quick-reply buttons shown to channel users. Use `userPersistentMenus.list` first to avoid duplicating an existing one.",
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
      summary: "Update user persistent menu",
      description:
        "Replaces an existing persistent menu's items. Call `userPersistentMenus.get` to inspect current values first.",
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
      summary: "Delete user persistent menu",
      description:
        "Permanently deletes a persistent menu. Use `userPersistentMenus.list` to find its id first.",
      successStatus: 204,
      tags: ["User Persistent Menus"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "User persistent menu id. Get it from `userPersistentMenus.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await userPersistentMenuService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
