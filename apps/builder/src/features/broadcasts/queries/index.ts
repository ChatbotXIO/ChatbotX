import { broadcastService } from "@chatbotx.io/business"
import { broadcastScheduleTypes } from "@chatbotx.io/database/partials"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import type { GetBroadcastsSchema } from "../schema/query"
import type { BroadcastResourceWithRelations } from "../schema/resource"

/** Statuses a repeating template borrows to mean "paused" / "ended". */
const TEMPLATE_BORROWED_STATUSES: readonly string[] = ["cancelled", "sent"]

/**
 * The list shows one-off broadcasts and repeating series, never the runs a
 * series spawns (they live on the series' runs page). The "Cancelled" and
 * "Completed" filters are about sends, so they leave the paused/ended series
 * out; the "Repeating" filter is the only one that lists series by schedule.
 */
export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<PaginatedResponse<BroadcastResourceWithRelations>> {
  const { kind, ...rest } = input
  return await broadcastService.list({
    ...rest,
    includeRuns: false,
    schedulesType:
      kind === "repeating" ? broadcastScheduleTypes.enum.recurring : undefined,
    excludeTemplates:
      kind !== "repeating" &&
      TEMPLATE_BORROWED_STATUSES.includes(input.status ?? ""),
  })
}
