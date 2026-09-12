import { userPersistentMenuService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listUserPersistentMenusRequest,
  listUserPersistentMenusResponse,
} from "../schema/action"

export const userPersistentMenusAuthenticatedAPI = {
  listUserPersistentMenusAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/user-persistent-menus",
      summary: "List user persistent menus",
      tags: ["User Persistent Menus"],
    })
    .input(listUserPersistentMenusRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listUserPersistentMenusResponse)
    .handler(async ({ input }) => {
      const data = await userPersistentMenuService.listByWorkspace({
        workspaceId: input.workspaceId,
      })
      return { data }
    }),
}
