import { and, asc, type DatabaseClient, db, eq, sql } from "../../client"
import type { SocialPostSnippetKind } from "../../partials/social-post-snippet"
import { socialPostSnippetModel } from "../../schema"

// Built when a query runs, not when the module loads (a test that mocks the
// schema must be able to import the repositories).
const snippetColumns = () => ({
  content: socialPostSnippetModel.content,
  id: socialPostSnippetModel.id,
  kind: socialPostSnippetModel.kind,
  name: socialPostSnippetModel.name,
  position: socialPostSnippetModel.position,
})

export const socialPostSnippetRepository = {
  async list(
    input: { kind?: SocialPostSnippetKind; limit: number; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select(snippetColumns())
      .from(socialPostSnippetModel)
      .where(
        and(
          eq(socialPostSnippetModel.workspaceId, input.workspaceId),
          input.kind ? eq(socialPostSnippetModel.kind, input.kind) : undefined,
        ),
      )
      .orderBy(
        asc(socialPostSnippetModel.position),
        asc(socialPostSnippetModel.name),
        asc(socialPostSnippetModel.id),
      )
      .limit(input.limit)
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(snippetColumns())
      .from(socialPostSnippetModel)
      .where(
        and(
          eq(socialPostSnippetModel.id, input.id),
          eq(socialPostSnippetModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /** Serialises snippet creation in a workspace until the transaction ends. */
  async lockWorkspaceSnippets(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('post-snippets:' || ${workspaceId}::text, 0))`,
    )
  },

  async countByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      socialPostSnippetModel,
      eq(socialPostSnippetModel.workspaceId, workspaceId),
    )
  },

  /** The position after the last snippet, so a new one lands at the end. */
  async nextPosition(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    const [row] = await tx
      .select({
        next: sql<number>`COALESCE(MAX(${socialPostSnippetModel.position}), -1) + 1`,
      })
      .from(socialPostSnippetModel)
      .where(eq(socialPostSnippetModel.workspaceId, workspaceId))

    return Number(row?.next ?? 0)
  },

  /** `null` when the name is already taken in the workspace. */
  async insert(
    input: {
      content: string
      kind: SocialPostSnippetKind
      name: string
      position: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(socialPostSnippetModel)
      .values(input)
      .onConflictDoNothing({
        target: [
          socialPostSnippetModel.workspaceId,
          socialPostSnippetModel.name,
        ],
      })
      .returning(snippetColumns())

    return row ?? null
  },

  /** `null` when the snippet does not exist; throws a unique violation on a taken name. */
  async update(
    input: {
      content?: string
      id: string
      kind?: SocialPostSnippetKind
      name?: string
      position?: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const { id, workspaceId, ...changes } = input
    const [row] = await tx
      .update(socialPostSnippetModel)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(
          eq(socialPostSnippetModel.id, id),
          eq(socialPostSnippetModel.workspaceId, workspaceId),
        ),
      )
      .returning(snippetColumns())

    return row ?? null
  },

  async delete(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(socialPostSnippetModel)
      .where(
        and(
          eq(socialPostSnippetModel.id, input.id),
          eq(socialPostSnippetModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialPostSnippetModel.id })

    return rows.length > 0
  },
}
