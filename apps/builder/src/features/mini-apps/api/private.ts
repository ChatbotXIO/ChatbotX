import { miniAppService } from "@chatbotx.io/business/mini-app"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listMiniAppOptionsRequest,
  listMiniAppOptionsResponse,
} from "../schema/private"

const tags = ["Mini Apps"]

/** Most Mini Apps a picker lists; a workspace rarely has more. */
const MINI_APP_OPTIONS_LIMIT = 500

export const miniAppsAuthenticatedAPI = {
  listMiniAppOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/mini-apps/options",
      summary: "List Mini App options",
      tags,
    })
    .input(listMiniAppOptionsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMiniAppOptionsResponse)
    .handler(async ({ input }) => {
      const result = await miniAppService.list({
        workspaceId: input.workspaceId,
        page: 1,
        perPage: MINI_APP_OPTIONS_LIMIT,
        sort: [{ id: "createdAt", desc: true }],
      })
      return result.data.map((miniApp) => ({
        id: miniApp.id,
        name: miniApp.name,
      }))
    }),
}
