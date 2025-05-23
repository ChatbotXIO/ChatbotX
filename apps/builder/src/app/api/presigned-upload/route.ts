import { auth } from "@/auth"
import { errorResponse } from "@/lib/error-handling"
import { safeJsonParse } from "@/lib/serialize"
import { createPresignedUploadRequest, uploader } from "@ahachat.ai/filesystem"
import { unauthorized } from "next/navigation"
import { NextResponse, type NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return unauthorized()
    }

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
