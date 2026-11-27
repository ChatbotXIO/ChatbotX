import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  inboxTeamModel,
  mediaLibraryFileModel,
  userModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"

/**
 * Workspace-scoped existence lookups for ids a pipeline mutation references.
 * Every id is checked against the caller's workspace so a foreign id can never
 * be attached; the service turns a short result into a 404.
 */
export const pipelineReferenceRepository = {
  /**
   * Whether the user still exists, holding a key-share lock until the
   * transaction ends so the account cannot be deleted while rows that point
   * at it are written (activity `actorUserId`).
   */
  async lockUserIfExists(userId: string, tx: DatabaseClient) {
    const [row] = await tx
      .select({ id: userModel.id })
      .from(userModel)
      .where(eq(userModel.id, userId))
      .for("key share")
    return row !== undefined
  },

  async listWorkspaceMembers(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select({
        id: workspaceMemberModel.id,
        userId: workspaceMemberModel.userId,
      })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, input.workspaceId),
          inArray(workspaceMemberModel.id, input.ids),
        ),
      )
  },

  async listInboxTeamIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: inboxTeamModel.id })
      .from(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.workspaceId, input.workspaceId),
          inArray(inboxTeamModel.id, input.ids),
        ),
      )
    return rows.map((row) => row.id)
  },

  async listMediaLibraryFileIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: mediaLibraryFileModel.id })
      .from(mediaLibraryFileModel)
      .where(
        and(
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
          inArray(mediaLibraryFileModel.id, input.ids),
        ),
      )
    return rows.map((row) => row.id)
  },

  /** Display fields of the contacts on a page of cards, in one query. */
  async listContactSummaries(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select({
        id: contactModel.id,
        fullName: contactModel.fullName,
        avatar: contactModel.avatar,
        email: contactModel.email,
        phoneNumber: contactModel.phoneNumber,
      })
      .from(contactModel)
      .where(
        and(
          eq(contactModel.workspaceId, input.workspaceId),
          inArray(contactModel.id, input.ids),
        ),
      )
  },

  async contactExists(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({ id: contactModel.id })
      .from(contactModel)
      .where(
        and(
          eq(contactModel.workspaceId, input.workspaceId),
          eq(contactModel.id, input.id),
        ),
      )
      .limit(1)
    return Boolean(row)
  },
}
