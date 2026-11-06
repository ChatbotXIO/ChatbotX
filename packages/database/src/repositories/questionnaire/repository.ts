import { type DatabaseClient, db } from "../../client"
import { escapeLikePattern } from "../../utils"

export const questionnaireRepository = {
  /**
   * Names of the workspace's live questionnaires starting with `prefix` (taken
   * as plain text) — the set the unique name index applies to.
   */
  async listNamesWithPrefix(
    input: { workspaceId: string; prefix: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.questionnaireModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true as const },
        name: { like: `${escapeLikePattern(input.prefix)}%` },
      },
      columns: { name: true },
    })
    return rows.map((row) => row.name)
  },
}
