import { type DatabaseClient, db } from "../../client"

/**
 * Single-purpose repository for resolving an `Import`'s owning workspace by
 * id. Runs inside the blocked-owner-guard fast path
 * (`apps/worker/src/lib/resolve-workspace-id.ts`) — must stay one indexed
 * primary-key read projecting only `workspaceId`, and must never throw (the
 * guard treats `undefined` as fail-open, per AGENTS.md invariant 15).
 *
 * Follow-up: the `AI_WORKSPACE_SCOPES` union in
 * `ai-workspace-scope/repository.ts` is close to a general "resolve
 * workspace by record id" registry; folding `importId` into a renamed
 * `workspaceScopeRepository` would remove this one-off repository.
 */
export const importRepository = {
  async findWorkspaceId(
    props: { id: string },
    tx: DatabaseClient = db,
  ): Promise<string | undefined> {
    const row = await tx.query.importModel.findFirst({
      where: { id: props.id },
      columns: { workspaceId: true },
    })
    return row?.workspaceId
  },
}
