import {
  isPlatformAdmin,
  resolveTenantSettings,
  resolveTenantSettingsByDomain,
} from "@chatbotx.io/business"
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
  getCurrentUserId,
} from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { safeJsonParse } from "@/lib/serialize"
import { getUploadHandler } from "@/lib/upload/handlers"

export async function POST(req: NextRequest) {
  try {
    const body = await safeJsonParse(req)
    const input = presignImportUploadRequest.parse(body)

    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let storageUrl: string

    if (input.workspaceId) {
      await assertCurrentUserCanAccessChatbot(input.workspaceId)
      ;({ storageUrl } = await resolveTenantSettings({
        workspaceId: input.workspaceId,
      }))
    } else {
      if (input.type === "import") {
        return NextResponse.json(
          { error: "workspaceId is required for import uploads" },
          { status: 400 },
        )
      }
      const user = await getCurrentUser()
      if (!(user && (await isPlatformAdmin(user)))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const domain = await getDomainFromHeader()
      ;({ storageUrl } = await resolveTenantSettingsByDomain(domain))
    }

    const handlerInput = { ...input, userId }

    const handler = getUploadHandler(input.type)
    const result = handler(handlerInput)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      )
    }

    const { path } = result

    const presignedPostUrl = await uploader.getPresignedUpload(path)
    const publicUrl = new URL(path, storageUrl).toString()

    const fileId = createId()
    await db.insert(fileModel).values({
      id: fileId,
      workspaceId: input.workspaceId ?? null,
      userId,
      contextType:
        input.type === "import"
          ? fileContextTypes.enum.import
          : fileContextTypes.enum.generic,
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
    })
  } catch (error) {
    return serverErrorHandler(error)
  }
}
