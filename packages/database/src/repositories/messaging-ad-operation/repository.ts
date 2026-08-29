import { and, type DatabaseClient, db, eq } from "../../client"
import type {
  MessagingAdChannel,
  MessagingAdCreateState,
  MessagingAdOperationInput,
  MessagingAdPublishState,
} from "../../partials/messaging-ad"
import { messagingAdOperationModel } from "../../schema"
import type { MessagingAdOperationModel } from "../../types"

type WorkspaceOperationRef = {
  id: string
  workspaceId: string
}

const workspaceOperationFilter = (input: WorkspaceOperationRef) =>
  and(
    eq(messagingAdOperationModel.id, input.id),
    eq(messagingAdOperationModel.workspaceId, input.workspaceId),
  )

type CreateMessagingAdOperationInput = {
  id: string
  workspaceId: string
  channel: MessagingAdChannel
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  integrationInstagramId?: string | null
  adAccountId: string
  name: string
  input: MessagingAdOperationInput
  createdBy?: string | null
}

type UpdateCreateProgressInput = WorkspaceOperationRef & {
  createState: MessagingAdCreateState
  metaCampaignId?: string
  metaAdSetId?: string
  metaAdCreativeId?: string
  metaAdId?: string
  lastError?: string | null
}

type UpdatePublishStateInput = WorkspaceOperationRef & {
  publishState: MessagingAdPublishState
  lastError?: string | null
}

export const messagingAdOperationRepository = {
  /**
   * Inserts the operation record BEFORE the first Graph POST — the `id`
   * passed in is the operationId the caller already generated and will embed
   * into every created Meta object's name (`buildCorrelationName`).
   */
  async create(
    input: CreateMessagingAdOperationInput,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdOperationModel> {
    const [row] = await tx
      .insert(messagingAdOperationModel)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        channel: input.channel,
        integrationWhatsappId: input.integrationWhatsappId ?? null,
        integrationMessengerId: input.integrationMessengerId ?? null,
        integrationInstagramId: input.integrationInstagramId ?? null,
        adAccountId: input.adAccountId,
        name: input.name,
        input: input.input,
        createdBy: input.createdBy ?? null,
      })
      .returning()
    if (!row) {
      throw new Error("Failed to create MessagingAdOperation")
    }
    return row
  },

  async findByIdForWorkspace(
    input: WorkspaceOperationRef,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdOperationModel | null> {
    const [row] = await tx
      .select()
      .from(messagingAdOperationModel)
      .where(workspaceOperationFilter(input))
      .limit(1)
    return row ?? null
  },

  /**
   * Lists a workspace's operations, optionally scoped to ONE channel +
   * integration so each integration's Ads tab shows only its own ads (never
   * other channels'/pages' operations in the same workspace).
   */
  listByWorkspaceId(
    input: {
      workspaceId: string
      channel?: MessagingAdChannel
      integrationWhatsappId?: string | null
      integrationMessengerId?: string | null
      integrationInstagramId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<MessagingAdOperationModel[]> {
    return tx.query.messagingAdOperationModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.integrationWhatsappId
          ? { integrationWhatsappId: input.integrationWhatsappId }
          : {}),
        ...(input.integrationMessengerId
          ? { integrationMessengerId: input.integrationMessengerId }
          : {}),
        ...(input.integrationInstagramId
          ? { integrationInstagramId: input.integrationInstagramId }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    })
  },

  /**
   * Atomically claims a `failed` operation for retry (CAS `failed` -> `pending`)
   * so two concurrent retries of the SAME operation can't both pass the
   * reconcile-then-create check and duplicate the Meta object tree. Returns the
   * claimed row, or `null` if it was not in a retryable (`failed`) state —
   * meaning another retry already holds it, or it is not retryable.
   */
  async claimForRetry(
    input: WorkspaceOperationRef,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdOperationModel | null> {
    const [row] = await tx
      .update(messagingAdOperationModel)
      .set({ createState: "pending", lastError: null })
      .where(
        and(
          workspaceOperationFilter(input),
          eq(messagingAdOperationModel.createState, "failed"),
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Persists a completed create step incrementally — the reconcile/retry
   * loop calls this after EVERY successful campaign/adSet/creative/ad
   * create, never batching multiple steps into one write.
   */
  async updateCreateProgress(
    input: UpdateCreateProgressInput,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdOperationModel | null> {
    const [row] = await tx
      .update(messagingAdOperationModel)
      .set({
        createState: input.createState,
        ...(input.metaCampaignId
          ? { metaCampaignId: input.metaCampaignId }
          : {}),
        ...(input.metaAdSetId ? { metaAdSetId: input.metaAdSetId } : {}),
        ...(input.metaAdCreativeId
          ? { metaAdCreativeId: input.metaAdCreativeId }
          : {}),
        ...(input.metaAdId ? { metaAdId: input.metaAdId } : {}),
        lastError: input.lastError ?? null,
      })
      .where(workspaceOperationFilter(input))
      .returning()
    return row ?? null
  },

  async updatePublishState(
    input: UpdatePublishStateInput,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdOperationModel | null> {
    const [row] = await tx
      .update(messagingAdOperationModel)
      .set({
        publishState: input.publishState,
        lastError: input.lastError ?? null,
      })
      .where(workspaceOperationFilter(input))
      .returning()
    return row ?? null
  },

  async setCleanupError(
    input: WorkspaceOperationRef & { cleanupError: string | null },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(messagingAdOperationModel)
      .set({ cleanupError: input.cleanupError })
      .where(workspaceOperationFilter(input))
  },
}
