import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listUserPersistentMenus } from "../queries"
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
    .handler(async ({ input }) => await listUserPersistentMenus(input)),
}
