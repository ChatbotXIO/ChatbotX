import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import {
  leaderboardPlatforms,
  leaderboardStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const tags = ["Leaderboards"]

/** Lightweight picker rows (flow step, condition field, participants switcher). */
export const leaderboardOptionResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  status: leaderboardStatuses,
  platform: leaderboardPlatforms,
  participants: z.number(),
})

const OPTIONS_PAGE_SIZE = 200

export const leaderboardsAuthenticatedAPI = {
  listLeaderboardOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/leaderboards/options",
      summary: "List leaderboard options",
      tags,
    })
    .input(z.object({ workspaceId: zodBigintAsString() }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(leaderboardOptionResource) }))
    .handler(async ({ input }) => {
      const result = await leaderboardService.list({
        workspaceId: input.workspaceId,
        page: 1,
        perPage: OPTIONS_PAGE_SIZE,
      })
      return {
        data: result.data.map((leaderboard) => ({
          id: leaderboard.id,
          name: leaderboard.name,
          status: leaderboard.status,
          platform: leaderboard.platform,
          participants: leaderboard.stats.participants,
        })),
      }
    }),
}
