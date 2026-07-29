import { emailTopicAnalyticsService } from "@chatbotx.io/analytics"
import { emailTopicService, verifyEmailClickToken } from "@chatbotx.io/business"
import { NextResponse } from "next/server"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get("r")
  const signedUrl = searchParams.get("u")
  let shouldRecordClick = false
  let trackedWorkspaceId: string | undefined
  let checkedWorkspaceId: string | undefined

  const isWorkspaceServable = async (workspaceId: string) => {
    if (checkedWorkspaceId === workspaceId) {
      return true
    }

    const { servable } = await loadServableWorkspace(workspaceId)
    if (servable) {
      checkedWorkspaceId = workspaceId
    }
    return servable
  }

  if (token) {
    const workspaceId = await emailTopicService.findAnalyticsWorkspaceIdByToken(
      {
        token,
      },
    )
    if (workspaceId) {
      trackedWorkspaceId = workspaceId
      if (!(await isWorkspaceServable(workspaceId))) {
        return NextResponse.json(
          { code: "workspaceScheduledDeletion" },
          { status: 410 },
        )
      }
    }

    shouldRecordClick = true
  }

  if (signedUrl) {
    try {
      const payload = await verifyEmailClickToken(signedUrl)
      if (
        payload.workspaceId &&
        trackedWorkspaceId &&
        payload.workspaceId !== trackedWorkspaceId
      ) {
        return NextResponse.redirect(origin, { status: 302 })
      }

      const redirectWorkspaceId = payload.workspaceId ?? trackedWorkspaceId
      if (!redirectWorkspaceId) {
        return NextResponse.redirect(origin, { status: 302 })
      }

      if (!(await isWorkspaceServable(redirectWorkspaceId))) {
        return NextResponse.json(
          { code: "workspaceScheduledDeletion" },
          { status: 410 },
        )
      }

      if (shouldRecordClick && token) {
        await emailTopicAnalyticsService.recordClick(token)
      }

      return NextResponse.redirect(payload.url, { status: 302 })
    } catch {
      // Tampered, malformed, or expired token: never redirect to an
      // attacker-controlled target. Fall through to a safe same-origin redirect.
    }
  }

  if (shouldRecordClick && !signedUrl && token) {
    await emailTopicAnalyticsService.recordClick(token)
  }

  return NextResponse.redirect(origin, { status: 302 })
}
