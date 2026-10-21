import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import type { OpenHoursRange } from "@chatbotx.io/database/partials"
import { ecommerceOpenHoursModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export const ecommerceOpenHoursRepository = {
  async list(workspaceId: string, tx: DatabaseClient = db) {
    return await tx
      .select()
      .from(ecommerceOpenHoursModel)
      .where(eq(ecommerceOpenHoursModel.workspaceId, workspaceId))
      .orderBy(
        asc(ecommerceOpenHoursModel.name),
        asc(ecommerceOpenHoursModel.id),
      )
  },

  async find(
    input: { workspaceId: string; openHoursId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.ecommerceOpenHoursModel.findFirst({
      where: { id: input.openHoursId, workspaceId: input.workspaceId },
    })
  },

  async findByIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(ecommerceOpenHoursModel)
      .where(
        and(
          eq(ecommerceOpenHoursModel.workspaceId, input.workspaceId),
          inArray(ecommerceOpenHoursModel.id, input.ids),
        ),
      )
  },

  async create(
    input: { workspaceId: string; name: string; ranges: OpenHoursRange[] },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(ecommerceOpenHoursModel)
      .values({ id: createId(), ...input })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      openHoursId: string
      values: { name?: string; ranges?: OpenHoursRange[] }
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(ecommerceOpenHoursModel)
      .set(input.values)
      .where(
        and(
          eq(ecommerceOpenHoursModel.id, input.openHoursId),
          eq(ecommerceOpenHoursModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async delete(
    input: { workspaceId: string; openHoursId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(ecommerceOpenHoursModel)
      .where(
        and(
          eq(ecommerceOpenHoursModel.id, input.openHoursId),
          eq(ecommerceOpenHoursModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },
}
