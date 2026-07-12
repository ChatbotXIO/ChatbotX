import { systemFieldService } from "@chatbotx.io/business/system-field"
import { NextResponse } from "next/server"
import {
  parseMeLinkSearchParams,
  toMePrivacyParams,
} from "@/features/system-fields/lib/me-link-params"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const input = parseMeLinkSearchParams(new URL(request.url).searchParams)
  if (!input) {
    return new Response(null, { status: 404 })
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
