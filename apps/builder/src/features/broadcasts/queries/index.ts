import { broadcastService } from "@chatbotx.io/business"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import type { GetBroadcastsSchema } from "../schema/query"
import type { BroadcastResourceWithRelations } from "../schema/resource"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<PaginatedResponse<BroadcastResourceWithRelations>> {
  return await broadcastService.list(input)
}

export async function listBroadcastAudience(input: {
  idOrName: string
  workspaceId: string
  page?: number | null
  perPage?: number | null
}) {
  return await broadcastService.listAudience(input)
}
