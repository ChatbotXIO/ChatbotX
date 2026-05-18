import { createPresignedUploadRequest, uploader } from "@chatbotx.io/filesystem"
import { type NextRequest, NextResponse } from "next/server"
import { getPlatformSettings } from "@/features/platform/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { safeJsonParse } from "@/lib/serialize"

export async function POST(req: NextRequest) {
  try {
    const body = await safeJsonParse(req)
    const data = createPresignedUploadRequest.parse(body)

    const { assetUrl } = await getPlatformSettings()

    const result = await Promise.all(
      data.map(async (d) => {
        const presignedPostUrl = await uploader.getPresignedUpload(
          d.path,
          // d.name,
          // d.mimeType,
        )

        const publicUrl = new URL(d.path, assetUrl).toString()

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
