import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  sql,
} from "../../client"
import { integrationInstagramModel } from "../../schema"
import type { IntegrationInstagramModel } from "../../types"

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type InsertInstagramIntegrationInput = Pick<
  typeof integrationInstagramModel.$inferInsert,
  | "id"
  | "workspaceId"
  | "inboxId"
  | "igId"
  | "pageId"
  | "auth"
  | "name"
  | "username"
  | "persistentMenus"
> &
  Partial<
    Pick<
      typeof integrationInstagramModel.$inferInsert,
      "type" | "conversationStarters"
    >
  >

type UpdateInstagramCapiScopeCacheInput = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  capiScopeCheckedAt: Date | null
  expectedCapiScopeCheckedAt: Date | null
}

type ClaimInstagramCapiScopeCacheRefreshInput = WorkspaceIntegrationRef & {
  capiScopeCheckedAt: Date
  expectedCapiScopeCheckedAt: Date | null
}

type UpdateDatasetIdIfNullInput = WorkspaceIntegrationRef & {
  datasetId: string
}

type UpdateCapiTestEventCodeInput = WorkspaceIntegrationRef & {
  capiTestEventCode: string | null
}

type UpdateCapiAccessTokenInput = WorkspaceIntegrationRef & {
  capiAccessToken: EncryptedData
}

const workspaceIntegrationFilter = (input: WorkspaceIntegrationRef) =>
  and(
    eq(integrationInstagramModel.id, input.id),
    eq(integrationInstagramModel.workspaceId, input.workspaceId),
  )

const capiScopeCasFilter = (
  input: WorkspaceIntegrationRef & { expectedCapiScopeCheckedAt: Date | null },
) =>
  and(
    workspaceIntegrationFilter(input),
    sql`${integrationInstagramModel.capiScopeCheckedAt} IS NOT DISTINCT FROM ${input.expectedCapiScopeCheckedAt}`,
  )

export const integrationInstagramRepository = {
  /**
   * Inserts a new Instagram integration row. Callers pass the already-
   * resolved `inboxId` from `connectChannelIntegration`'s
   * `insertIntegration` callback. `type` defaults to the column default
   * ("instagram") when omitted — pass `"facebook"` for the Facebook-linked
   * login variant.
   */
  async insert(
    input: InsertInstagramIntegrationInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel> {
    // `conversationStarters`/`persistentMenus` are NOT NULL columns with no
    // database default (drizzle-kit drops a jsonb `sql` default when it
    // serializes the snapshot, so the schema-level `.default(sql`[]`)` was never
    // migrated) while `$inferInsert` still marks them optional, so both must be
    // written explicitly or the insert fails — pinned by
    // `__tests__/integration/insert-required-columns.test.ts`. `type` does have
    // a database default ("instagram") and is left to the column.
    const [row] = await tx
      .insert(integrationInstagramModel)
      .values({
        ...input,
        conversationStarters: input.conversationStarters ?? [],
        persistentMenus: input.persistentMenus ?? [],
      })
      .returning()

    return row
  },

  /**
   * Instagram ids from the given list that already have an integration.
   * `IntegrationInstagram.igId` is unique platform-wide, so a match means the
   * account cannot be connected again anywhere.
   */
  async findConnectedIgIds(
    igIds: string[],
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    if (igIds.length === 0) {
      return new Set()
    }

    const rows = await tx
      .select({ igId: integrationInstagramModel.igId })
      .from(integrationInstagramModel)
      .where(inArray(integrationInstagramModel.igId, igIds))

    return new Set(rows.map((row) => row.igId))
  },

  async findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .select()
      .from(integrationInstagramModel)
      .where(workspaceIntegrationFilter(input))
      .limit(1)

    return row ?? null
  },

  /**
   * Instagram counterpart to
   * `integrationWhatsappRepository.findWorkspaceIntegrationByInboxId` (Phase
   * 3 channel-aware ads-conversion gate call sites): resolves the Instagram
   * integration that owns a given `Inbox.id`. Backs both the native
   * Instagram-login and Instagram-via-Facebook-Page integrations — both
   * persist to this same table.
   */
  async findWorkspaceIntegrationByInboxId(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | null> {
    const [row] = await tx
      .select({ id: integrationInstagramModel.id })
      .from(integrationInstagramModel)
      .where(
        and(
          eq(integrationInstagramModel.inboxId, input.inboxId),
          eq(integrationInstagramModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async updateCapiScopeCache(
    input: UpdateInstagramCapiScopeCacheInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? this.findWorkspaceIntegration(input, tx)
  },

  async claimCapiScopeCacheRefresh(
    input: ClaimInstagramCapiScopeCacheRefreshInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? null
  },

  async updateDatasetIdIfNull(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ datasetId: input.datasetId })
      .where(
        and(
          workspaceIntegrationFilter(input),
          isNull(integrationInstagramModel.datasetId),
        ),
      )
      .returning()

    return row ?? null
  },

  async updateDatasetId(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ datasetId: input.datasetId })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },
  async updateCapiTestEventCode(
    input: UpdateCapiTestEventCodeInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiTestEventCode: input.capiTestEventCode })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async updateCapiAccessToken(
    input: UpdateCapiAccessTokenInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiAccessToken: input.capiAccessToken })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async connectCustomCapi(
    input: WorkspaceIntegrationRef & {
      datasetId: string
      capiAccessToken: EncryptedData
    },
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        datasetId: input.datasetId,
        capiAccessToken: input.capiAccessToken,
        capiDisconnectedAt: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async setCapiDisconnectedAt(
    input: WorkspaceIntegrationRef & { capiDisconnectedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        capiDisconnectedAt: input.capiDisconnectedAt,
        capiAccessToken: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiDisconnectedAt(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiDisconnectedAt: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiAccessToken(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationInstagramModel | null> {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({ capiAccessToken: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },
}
