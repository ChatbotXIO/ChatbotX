import { systemFieldService } from "@chatbotx.io/business/system-field"
import { NextResponse } from "next/server"
import {
  parseMeLinkSearchParams,
  toMePrivacyParams,
} from "@/features/system-fields/lib/me-link-params"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const input = parseMeLinkSearchParams(new URL(request.url).searchParams)
  if (!input) {
    return new Response(null, { status: 404 })
  }

  const { servable } = await loadServableWorkspace(input.w)
  if (!servable) {
    return NextResponse.json(
      { code: "workspaceScheduledDeletion" },
      { status: 410 },
    )
  }

  const data = await systemFieldService.buildMeExport(toMePrivacyParams(input))

  if (!data) {
    return new Response(null, { status: 404 })
  }

  const filename = `${input.u.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`
  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
