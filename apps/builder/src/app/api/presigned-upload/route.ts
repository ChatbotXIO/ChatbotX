import { auth } from "@/auth"
import { createPresignedUploadRequest, uploader } from "@ahachat.ai/filesystem"
import { notFound, unauthorized } from "next/navigation"
import { NextResponse, type NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return unauthorized()
  }

  const body = await req.json()
  const { success, data } = createPresignedUploadRequest.safeParse(body)

  if (!success) {
    return notFound()
  }

  const path = `tmp/${session.user.id}/${data.name}`
  const form = await uploader.getPresignedUpload(path, data.mimeType)

  return NextResponse.json(form)
}
