import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  or,
} from "../../client"
import { flowVersionModel } from "../../schema"
import type { FlowVersionModel } from "../../types"

export const flowVersionRepository = {
  /**
   * One query for many flows: each flow's live published version, falling back
   * to its draft. `DISTINCT ON (flowId)` with `isDraft` ascending keeps the
   * published row (`false`) ahead of the draft (`true`), so at most one row per
   * flow crosses the wire instead of one query per flow and per version kind.
   */
  async findPreferredByFlowIds(
    input: { workspaceId: string; flowIds: readonly string[] },
    tx: DatabaseClient = db,
  ): Promise<FlowVersionModel[]> {
    if (input.flowIds.length === 0) {
      return []
    }
    return await tx
      .selectDistinctOn([flowVersionModel.flowId])
      .from(flowVersionModel)
      .where(
        and(
          eq(flowVersionModel.workspaceId, input.workspaceId),
          inArray(flowVersionModel.flowId, [...input.flowIds]),
          or(
            eq(flowVersionModel.isDraft, true),
            and(
              eq(flowVersionModel.isDraft, false),
              eq(flowVersionModel.isLatest, true),
            ),
          ),
        ),
      )
      .orderBy(asc(flowVersionModel.flowId), asc(flowVersionModel.isDraft))
  },
}
