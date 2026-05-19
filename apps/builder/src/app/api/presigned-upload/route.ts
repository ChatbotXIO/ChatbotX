import { resolvePlatformUrlsByDomain } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { fileContextTypes, fileStatuses } from "@chatbotx.io/database/partials"
import { fileModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { presignImportUploadRequest } from "@/features/import/schemas/presign"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUser,
} from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { safeJsonParse } from "@/lib/serialize"
import { getUploadHandler } from "@/lib/upload/handlers"

export async function POST(req: NextRequest) {
  try {
    const body = await safeJsonParse(req)
    const input = presignImportUploadRequest.parse(body)

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await assertCurrentUserCanAccessChatbot(input.workspaceId)

    const handler = getUploadHandler(input.type)
    const result = handler(input)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      )
    }

    const { path } = result

    const presignedPostUrl = await uploader.getPresignedUpload(path)

    const domain = await getDomainFromHeader()
    const { assetUrl } = await resolvePlatformUrlsByDomain(domain)
    const publicUrl = new URL(path, assetUrl).toString()

    const fileId = createId()
    await db.insert(fileModel).values({
      id: fileId,
      workspaceId: input.workspaceId,
      userId: user.id,
      contextType: fileContextTypes.enum.import,
      subType: input.subType,
      path,
      fileName: input.fileName,
      mimeType: input.mimeType,
      status: fileStatuses.enum.pending,
    })

    return NextResponse.json({
      fileId,
      presignedPostUrl,
      publicUrl,
      path,
    })
  } catch (error) {
    return serverErrorHandler(error)
  }
}
