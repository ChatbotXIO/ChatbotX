import { db } from "@chatbotx.io/database/client"
import { uploader } from "@chatbotx.io/filesystem"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetExportFileRequest,
  GetExportFileResponse,
} from "../schemas/action"

export async function getExportFile(
  input: GetExportFileRequest,
): Promise<GetExportFileResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const file = await db.query.fileModel.findFirst({
    where: { id: input.fileId, workspaceId: input.workspaceId },
  })

  if (!file) {
    throw new Error("Export file not found")
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
