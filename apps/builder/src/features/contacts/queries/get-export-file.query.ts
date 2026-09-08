import { contactExportService } from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserId,
} from "@/lib/auth/utils"
import type {
  GetExportFileRequest,
  GetExportFileResponse,
} from "../schema/action"

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

  return await contactExportService.getFile({ ...input, userId })
}
