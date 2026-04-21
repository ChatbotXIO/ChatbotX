import {
  and,
  count,
  db,
  eq,
  isNotNull,
  sql,
} from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import type {
  SequenceFailedBulkUpdateItem,
  SequenceStepStats,
} from "../../schemas/sequence-stats"
import { BaseRepository } from "./base.repository"

export class SequenceStatsPgRepository extends BaseRepository {
  async getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    const { workspaceId, sequenceId, stepId } = input
    const t = sequenceDispatchModel

    const [deliveredResult, seenResult, clickedResult, failedResult] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.deliveredAt),
            ),
          ),
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.seenAt),
            ),
          ),
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.clickedAt),
            ),
          ),
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.failedAt),
            ),
          ),
      ])

    const delivered = deliveredResult[0]?.count ?? 0
    const seen = seenResult[0]?.count ?? 0
    const clicked = clickedResult[0]?.count ?? 0
    const failed = failedResult[0]?.count ?? 0

    return {
      "message:sent": delivered + failed,
      "message:delivered": delivered,
      "message:seen": seen,
      "flow:clicked": clicked,
      "message:failed": failed,
    }
  }

  async updateFailedBulk(items: SequenceFailedBulkUpdateItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const tuples = items.map(
      (i) => sql`(${i.sequenceId}, ${i.stepId}, ${i.contactInboxId})`,
    )
    const failedCases = items.map(
      (i) =>
        sql`WHEN "sequenceId" = ${i.sequenceId} AND "stepId" = ${i.stepId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.occurredAt}::timestamptz`,
    )
    const errorCases = items.map(
      (i) =>
        sql`WHEN "sequenceId" = ${i.sequenceId} AND "stepId" = ${i.stepId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.errorContent}`,
    )

    await db.execute(sql`
      UPDATE "SequenceDispatch"
      SET "failedAt" = COALESCE("failedAt", CASE ${sql.join(failedCases, sql` `)} END),
          "errorContent" = COALESCE("errorContent", CASE ${sql.join(errorCases, sql` `)} END)
      WHERE ("sequenceId", "stepId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }
}

export const sequenceStatsPgRepository = new SequenceStatsPgRepository()
