import { qrCodeService, qrCodeWorkspaceCacheTag } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListQrCodesRequest, ListQrCodesResponse } from "../schema/query"
import type { QrCodeResource } from "../schema/resource"

export const getWorkspaceCacheTag = qrCodeWorkspaceCacheTag

export async function listQrCodes(
  input: ListQrCodesRequest,
): Promise<ListQrCodesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await qrCodeService.list(input)
}

export async function findQrCode(where: {
  workspaceId: string
  id: string
}): Promise<QrCodeResource | undefined> {
  return await qrCodeService.find(where)
}
