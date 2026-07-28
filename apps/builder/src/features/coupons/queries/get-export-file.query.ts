import { couponService } from "@chatbotx.io/business"
import { uploader } from "@chatbotx.io/filesystem"
import { ORPCError } from "@orpc/server"
import { getCurrentUserId } from "@/lib/auth/utils"
import type {
  GetCouponExportFileRequest,
  GetCouponExportFileResponse,
} from "../schemas/query"

export async function getCouponExportFile(
  input: GetCouponExportFileRequest,
): Promise<GetCouponExportFileResponse> {
  const userId = await getCurrentUserId()
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" })
  }

  const file = await couponService.getExportFile({
    ...input,
    userId,
  })
  const downloadUrl =
    file.status === "uploaded"
      ? await uploader.getPresignedDownload(file.path, 5 * 60)
      : null

  return {
    status: file.status,
    fileName: file.fileName,
    downloadUrl,
    totalRecords: file.totalRecords,
  }
}
