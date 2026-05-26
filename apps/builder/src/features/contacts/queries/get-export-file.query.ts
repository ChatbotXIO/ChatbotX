import { db } from "@chatbotx.io/database/client"
import { uploader } from "@chatbotx.io/filesystem"
import { ORPCError } from "@orpc/server"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserId,
} from "@/lib/auth/utils"
import type {
  GetExportFileRequest,
  GetExportFileResponse,
} from "../schemas/action"

export async function getExportFile(
  input: GetExportFileRequest,
): Promise<GetExportFileResponse> {
  const [, userId] = await Promise.all([
    assertCurrentUserCanAccessChatbot(input.workspaceId),
    getCurrentUserId(),
  ])

  if (!userId) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" })
  }

  const file = await db.query.fileModel.findFirst({
    where: { id: input.fileId, workspaceId: input.workspaceId, userId },
  })

  if (!file) {
    throw new ORPCError("NOT_FOUND", { message: "Export file not found" })
  }

  const status = file.status as GetExportFileResponse["status"]

  const downloadUrl =
    status === "uploaded"
      ? await uploader.getPresignedDownload(file.path)
      : null

  return {
    status,
    fileName: file.fileName,
    downloadUrl,
    totalRecords: file.meta?.totalRecords ?? null,
  }
}
