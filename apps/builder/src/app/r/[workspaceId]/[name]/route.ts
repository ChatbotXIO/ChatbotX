import { db } from "@chatbotx.io/database/client"
import { interpolate } from "@chatbotx.io/variables"
import { type NextRequest, NextResponse } from "next/server"

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; name: string }> },
) => {
  const { workspaceId, name: nameParam } = await context.params
  const name = decodeURIComponent(nameParam)

  const row = await db.query.magicLinkModel.findFirst({
    where: {
      workspaceId,
      name,
    },
  })

  if (!row) {
    return NextResponse.json({ message: "Not found" }, { status: 404 })
  }

  let destination: string
  try {
    destination = interpolate(row.url, {
      ...Object.fromEntries(request.nextUrl.searchParams.entries()),
    })
  } catch {
    return NextResponse.json(
      { message: "Invalid link configuration" },
      { status: 400 },
    )
  }

  return NextResponse.redirect(destination, 302)
}
