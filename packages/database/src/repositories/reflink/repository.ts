import { countWithRelationsFilter, type DatabaseClient, db } from "../../client"
import { reflinkModel } from "../../schema"
import { parseOrderByAsObject } from "../../utils"

export const reflinkRepository = {
  listWithRelations(
    input: {
      where: Record<string, unknown>
      limit?: number
      offset?: number
      sort?: { id: string; desc: boolean }[] | null
    },
    tx: DatabaseClient = db,
  ) {
    const { where, limit, offset } = input
    const orderBy = parseOrderByAsObject(reflinkModel, input)
    return tx.query.reflinkModel.findMany({
      where,
      orderBy,
      limit,
      offset,
      with: {
        flow: true,
        customField: true,
      },
    })
  },

  count(
    input: { where: Record<string, unknown> },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return countWithRelationsFilter({
      client: tx,
      table: reflinkModel,
      tsName: "reflinkModel",
      where: input.where,
    })
  },
}
