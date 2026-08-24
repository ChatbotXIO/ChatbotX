import { and, type DatabaseClient, db, eq } from "../../client"
import { integrationApiModel } from "../../schema"
import type { IntegrationApiModel } from "../../types"

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type InsertIntegrationApiInput = {
  id: string
  inboxId: string
  workspaceId: string
  name: string
  auth: typeof integrationApiModel.$inferInsert.auth
  tokenHash: string
  tokenPrefix: string
  callbackUrl: string | null
}

type UpdateIntegrationApiSettingsInput = WorkspaceIntegrationRef & {
  name?: string
  callbackUrl?: string | null
  auth: typeof integrationApiModel.$inferInsert.auth
}

type RotateIntegrationApiTokenInput = WorkspaceIntegrationRef & {
  tokenHash: string
  tokenPrefix: string
}

const workspaceIntegrationFilter = (input: WorkspaceIntegrationRef) =>
  and(
    eq(integrationApiModel.id, input.id),
    eq(integrationApiModel.workspaceId, input.workspaceId),
  )

export const integrationApiRepository = {
  async findByTokenHash(
    tokenHash: string,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel | null> {
    const row = await tx.query.integrationApiModel.findFirst({
      where: { tokenHash },
    })

    return row ?? null
  },

  async findByInboxId(
    inboxId: string,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel | null> {
    const row = await tx.query.integrationApiModel.findFirst({
      where: { inboxId },
    })

    return row ?? null
  },

  async findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel | null> {
    const row = await tx.query.integrationApiModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })

    return row ?? null
  },

  async listByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel[]> {
    return await tx.query.integrationApiModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  },

  async insert(
    input: InsertIntegrationApiInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel> {
    const [row] = await tx
      .insert(integrationApiModel)
      .values({
        id: input.id,
        inboxId: input.inboxId,
        workspaceId: input.workspaceId,
        name: input.name,
        auth: input.auth,
        tokenHash: input.tokenHash,
        tokenPrefix: input.tokenPrefix,
        callbackUrl: input.callbackUrl,
        enabled: true,
      })
      .returning()

    return row
  },

  async updateSettings(
    input: UpdateIntegrationApiSettingsInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel | null> {
    const [row] = await tx
      .update(integrationApiModel)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.callbackUrl !== undefined && {
          callbackUrl: input.callbackUrl,
        }),
        auth: input.auth,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async rotateToken(
    input: RotateIntegrationApiTokenInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationApiModel | null> {
    const [row] = await tx
      .update(integrationApiModel)
      .set({ tokenHash: input.tokenHash, tokenPrefix: input.tokenPrefix })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async deleteById(id: string, tx: DatabaseClient = db): Promise<void> {
    await tx.delete(integrationApiModel).where(eq(integrationApiModel.id, id))
  },
}
