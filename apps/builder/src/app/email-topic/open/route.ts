import { emailTopicService, emailTrackingService } from "@chatbotx.io/business"
import { awardLeaderboardEmailEngagement } from "@chatbotx.io/business/leaderboard"
import { NextResponse } from "next/server"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("r")
  if (token) {
    const workspaceId = await emailTopicService.findAnalyticsWorkspaceIdByToken(
      {
        token,
      },
    )
    if (workspaceId) {
      const { servable } = await loadServableWorkspace(workspaceId)
      if (servable) {
        await emailTrackingService.recordTransitionOrEnqueueRepair({
          phase: "opened",
          token,
          workspaceId,
        })
        await awardLeaderboardEmailEngagement({ token, kind: "open" })
      }
    } else {
      await emailTrackingService.recordTransitionOrEnqueueRepair({
        phase: "opened",
        token,
      })
    }
  }

  return new NextResponse(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
