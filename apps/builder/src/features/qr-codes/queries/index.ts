import { qrCodeService, qrCodeWorkspaceCacheTag } from "@chatbotx.io/business"
import { withCache } from "@chatbotx.io/redis"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListQrCodesRequest, ListQrCodesResponse } from "../schema/query"
import type { QrCodeResource } from "../schema/resource"

export const getWorkspaceCacheTag = qrCodeWorkspaceCacheTag

// 1 hour: this builder-only cache mirrors what `qrCodeService.find` cached
// before it was made uncached for the public QR landing page (see that
// service for why). `update-qr-code.action.ts` / `delete-qr-codes.action.ts`
// invalidate `qrCodeWorkspaceCacheTag`, which busts this too.
const QR_CODE_ITEM_CACHE_TTL_SECONDS = 60 * 60

function getItemCacheKey(workspaceId: string, id: string): string {
  return `qr-codes:item:${workspaceId}:${id}`
}

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
  return await withCache(
    getItemCacheKey(where.workspaceId, where.id),
    async () => await qrCodeService.find(where),
    {
      ttl: QR_CODE_ITEM_CACHE_TTL_SECONDS,
      tags: [qrCodeWorkspaceCacheTag(where.workspaceId)],
    },
  )
}
