import { type DatabaseClient, db } from "../../client"
import { escapeLikePattern } from "../../utils"

export const minigameRepository = {
  /** Names in the workspace starting with `prefix` (taken as plain text). */
  async listNamesWithPrefix(
    input: { workspaceId: string; prefix: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.minigameModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        name: { like: `${escapeLikePattern(input.prefix)}%` },
      },
      columns: { name: true },
    })
    return rows.map((row) => row.name)
  },
}
