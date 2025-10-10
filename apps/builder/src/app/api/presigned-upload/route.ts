import { createPresignedUploadRequest, uploader } from "@aha.chat/filesystem"
import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { safeJsonParse } from "@/lib/serialize"

export async function POST(req: NextRequest) {
  try {
    const body = await safeJsonParse(req)
    const data = createPresignedUploadRequest.parse(body)

    const result = await Promise.all(
      data.map(async (d) => {
        const presignedPostUrl = await uploader.getPresignedUpload(
          d.path,
          // d.name,
          // d.mimeType,
        )

        const publicUrl = new URL(d.path, env.NEXT_PUBLIC_ASSET_URL).toString()

        return {
          presignedPostUrl,
          publicUrl,
        }
      }),
    )

    return NextResponse.json(result)
  } catch (error) {
    return serverErrorHandler(error)
  }
}
