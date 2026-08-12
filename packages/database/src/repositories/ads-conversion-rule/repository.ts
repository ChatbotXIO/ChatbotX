import { and, type DatabaseClient, db, eq } from "../../client"
import { adsConversionRuleModel } from "../../schema"
import type { AdsConversionRuleModel } from "../../types"

export type AdsConversionRuleListFilters = {
  channel?: AdsConversionRuleModel["channel"]
  enabled?: AdsConversionRuleModel["enabled"]
  integrationWhatsappId?: string
}

export type AdsConversionRuleCreateValues = Omit<
  typeof adsConversionRuleModel.$inferInsert,
  "id"
>

export type AdsConversionRuleUpdateValues = Partial<
  Omit<typeof adsConversionRuleModel.$inferInsert, "id" | "workspaceId">
>

const workspaceRuleFilter = (input: { id: string; workspaceId: string }) =>
  and(
    eq(adsConversionRuleModel.id, input.id),
    eq(adsConversionRuleModel.workspaceId, input.workspaceId),
  )

export const adsConversionRuleRepository = {
  listByWorkspace(
    workspaceId: string,
    filters: AdsConversionRuleListFilters = {},
    tx: DatabaseClient = db,
  ): Promise<AdsConversionRuleModel[]> {
    return tx.query.adsConversionRuleModel.findMany({
      where: {
        workspaceId,
        channel: filters.channel,
        enabled: filters.enabled,
        integrationWhatsappId: filters.integrationWhatsappId,
      },
      orderBy: { createdAt: "asc" },
    })
  },

  async findWorkspaceRule(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionRuleModel | null> {
    const row = await tx.query.adsConversionRuleModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
    })

    return row ?? null
  },

  async create(
    values: AdsConversionRuleCreateValues,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionRuleModel> {
    const [row] = await tx
      .insert(adsConversionRuleModel)
      .values(values)
      .returning()

    if (!row) {
      throw new Error("Failed to create ads conversion rule")
    }

    return row
  },

  async update(
    input: {
      id: string
      workspaceId: string
      values: AdsConversionRuleUpdateValues
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionRuleModel | null> {
    const [row] = await tx
      .update(adsConversionRuleModel)
      .set(input.values)
      .where(workspaceRuleFilter(input))
      .returning()

    return row ?? null
  },

  async delete(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionRuleModel | null> {
    const [row] = await tx
      .delete(adsConversionRuleModel)
      .where(workspaceRuleFilter(input))
      .returning()

    return row ?? null
  },
}
