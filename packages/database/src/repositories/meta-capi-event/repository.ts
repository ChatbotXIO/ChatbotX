import { and, type DatabaseClient, db, eq } from "../../client"
import type { MetaCapiStatus } from "../../schema"
import { metaCapiEventModel } from "../../schema"
import type { MetaCapiEventModel } from "../../types"

export type MetaCapiEventCreateValues = Omit<
  typeof metaCapiEventModel.$inferInsert,
  "id"
>

type FindWorkspaceEventInput = {
  id: string
  workspaceId: string
}

type UpdateCapiStatusInput = FindWorkspaceEventInput & {
  from: Extract<MetaCapiStatus, "pending">
  to: Exclude<MetaCapiStatus, "pending">
  capiSentAt?: Date
  capiError?: string | null
}

export const metaCapiEventRepository = {
  async insertIgnoreDuplicate(
    values: MetaCapiEventCreateValues,
    tx: DatabaseClient = db,
  ): Promise<MetaCapiEventModel | null> {
    const [row] = await tx
      .insert(metaCapiEventModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          metaCapiEventModel.workspaceId,
          metaCapiEventModel.channel,
          metaCapiEventModel.sourceKey,
        ],
      })
      .returning()

    return row ?? null
  },

  async findWorkspaceEvent(
    input: FindWorkspaceEventInput,
    tx: DatabaseClient = db,
  ): Promise<MetaCapiEventModel | null> {
    const [row] = await tx
      .select()
      .from(metaCapiEventModel)
      .where(
        and(
          eq(metaCapiEventModel.id, input.id),
          eq(metaCapiEventModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async findPendingBySourceKey(
    input: Pick<
      MetaCapiEventCreateValues,
      "workspaceId" | "channel" | "sourceKey"
    >,
    tx: DatabaseClient = db,
  ): Promise<MetaCapiEventModel | null> {
    const [row] = await tx
      .select()
      .from(metaCapiEventModel)
      .where(
        and(
          eq(metaCapiEventModel.workspaceId, input.workspaceId),
          eq(metaCapiEventModel.channel, input.channel),
          eq(metaCapiEventModel.sourceKey, input.sourceKey),
          eq(metaCapiEventModel.capiStatus, "pending"),
        ),
      )
      .limit(1)

    return row ?? null
  },

  // No FK cascade exists for the polymorphic integrationId; disconnect flows
  // must call this so stale rows stop occupying the sourceKey dedup slot.
  async deleteByIntegration(
    input: Pick<
      MetaCapiEventCreateValues,
      "workspaceId" | "channel" | "integrationId"
    >,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(metaCapiEventModel)
      .where(
        and(
          eq(metaCapiEventModel.workspaceId, input.workspaceId),
          eq(metaCapiEventModel.channel, input.channel),
          eq(metaCapiEventModel.integrationId, input.integrationId),
        ),
      )
  },

  async updateCapiStatus(
    input: UpdateCapiStatusInput,
    tx: DatabaseClient = db,
  ): Promise<MetaCapiEventModel | null> {
    const [row] = await tx
      .update(metaCapiEventModel)
      .set({
        capiStatus: input.to,
        capiSentAt: input.capiSentAt,
        capiError: input.capiError,
      })
      .where(
        and(
          eq(metaCapiEventModel.id, input.id),
          eq(metaCapiEventModel.workspaceId, input.workspaceId),
          eq(metaCapiEventModel.capiStatus, input.from),
        ),
      )
      .returning()

    return row ?? null
  },
}
