import type { EncryptedData } from "@chatbotx.io/encryption"
import { and, type DatabaseClient, db, eq, isNull, sql } from "../../client"
import type {
  TokenHash,
  WorkspaceApiTokenPermission,
  WorkspaceApiTokenScope,
} from "../../partials/workspace-api-token"
import { workspaceApiTokenModel } from "../../schema"
import type { WorkspaceApiTokenModel } from "../../types"

type InsertWorkspaceApiTokenInput = {
  workspaceId: string
  tokenHash: TokenHash
  name: string
  permission: WorkspaceApiTokenPermission
  tokenPrefix: string
  // NULL/undefined = unrestricted ("All scopes"); see schema doc.
  scopes?: WorkspaceApiTokenScope[] | null
}

type InsertDefaultWorkspaceApiTokenInput = {
  workspaceId: string
  tokenHash: TokenHash
  name: string
  tokenPrefix: string
  encryptedToken: EncryptedData
}

type SetEncryptedTokenInput = {
  id: string
  workspaceId: string
  encryptedToken: EncryptedData
}

class WorkspaceApiTokenRepository {
  async findByTokenHash(
    tokenHash: TokenHash,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel | null> {
    const row = await tx.query.workspaceApiTokenModel.findFirst({
      where: { tokenHash },
    })

    return row ?? null
  }

  async listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel[]> {
    return await tx.query.workspaceApiTokenModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  }

  async countByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      workspaceApiTokenModel,
      eq(workspaceApiTokenModel.workspaceId, workspaceId),
    )
  }

  /**
   * Serializes concurrent creates for one workspace so the count-then-insert
   * in `createToken` can't let two callers both read under-cap and both
   * commit. Must be called inside the same transaction that does the count,
   * before the count — matching the `meta-catalog-item` and `appointment`
   * repositories' `pg_advisory_xact_lock` precedent.
   */
  async lockWorkspaceTokens(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    const lockKey = `workspace-api-tokens:${workspaceId}`
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    )
  }

  async deleteByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(workspaceApiTokenModel)
      .where(
        and(
          eq(workspaceApiTokenModel.id, input.id),
          eq(workspaceApiTokenModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: workspaceApiTokenModel.id })

    return rows.length > 0
  }

  async insert(
    input: InsertWorkspaceApiTokenInput,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel> {
    const [row] = await tx
      .insert(workspaceApiTokenModel)
      .values({
        workspaceId: input.workspaceId,
        tokenHash: input.tokenHash,
        name: input.name,
        permission: input.permission,
        tokenPrefix: input.tokenPrefix,
        scopes: input.scopes ?? null,
      })
      .returning()

    return row
  }

  async findDefaultByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel | null> {
    const row = await tx.query.workspaceApiTokenModel.findFirst({
      where: { workspaceId, isDefault: true },
    })

    return row ?? null
  }

  /**
   * Mints the workspace's default `{{api_key}}` token. Relies on the partial
   * unique index on `(workspaceId) WHERE "isDefault"` to make concurrent
   * mint attempts safe — the loser's insert is silently dropped and returns
   * null so the caller re-selects the winner's row instead of erroring.
   */
  async insertDefault(
    input: InsertDefaultWorkspaceApiTokenInput,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel | null> {
    const [row] = await tx
      .insert(workspaceApiTokenModel)
      .values({
        workspaceId: input.workspaceId,
        tokenHash: input.tokenHash,
        name: input.name,
        permission: "full",
        tokenPrefix: input.tokenPrefix,
        isDefault: true,
        encryptedToken: input.encryptedToken,
      })
      .onConflictDoNothing({
        target: [workspaceApiTokenModel.workspaceId],
        where: sql`${workspaceApiTokenModel.isDefault}`,
      })
      .returning()

    return row ?? null
  }

  /**
   * Lazy-upgrades a legacy default row (backfilled from `Workspace.token`,
   * no `encryptedToken` yet) once its plaintext has been recovered. Guarded
   * so a concurrent upgrade is a no-op rather than overwriting a blob
   * encrypted under a different IV.
   */
  async setEncryptedToken(
    input: SetEncryptedTokenInput,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(workspaceApiTokenModel)
      .set({ encryptedToken: input.encryptedToken })
      .where(
        and(
          eq(workspaceApiTokenModel.id, input.id),
          eq(workspaceApiTokenModel.workspaceId, input.workspaceId),
          isNull(workspaceApiTokenModel.encryptedToken),
        ),
      )
  }
}

export const workspaceApiTokenRepository = new WorkspaceApiTokenRepository()
