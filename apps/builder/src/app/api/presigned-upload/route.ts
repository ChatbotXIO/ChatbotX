import { createPresignedUploadRequest, uploader } from "@aha.chat/filesystem"
import { type NextRequest, NextResponse } from "next/server"
import { errorResponse } from "@/lib/error-handling"
import { safeJsonParse } from "@/lib/serialize"

export async function POST(req: NextRequest) {
  try {
    const body = await safeJsonParse(req)
    const data = createPresignedUploadRequest.parse(body)

    const result = await Promise.all(
      data.map(async (d) => {
        const path = `public/chatbots/${d.filePathProps.chatbotId}/flows/${d.filePathProps.flowId}/steps/${d.filePathProps.stepId}`

        const presignedPost = await uploader.getPresignedUpload(
          path,
          d.fileName,
          d.fileType,
        )

        return {
          ...presignedPost,
          publicUrl: `${presignedPost.url}/${presignedPost.fields.key}`,
        }
      }),
    )

    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
