import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { listSavedReplies } from "@/features/saved-replies/queries"
import { auth } from "@/lib/auth/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    const userId = session?.user.id

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await listSavedReplies({
      userId,
    })

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
