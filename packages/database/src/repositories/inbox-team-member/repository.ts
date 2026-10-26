import { and, asc, type DatabaseClient, db, eq, inArray } from "../../client"
import { inboxTeamMemberModel, inboxTeamModel } from "../../schema"

/**
 * `InboxTeamMember` has no `workspaceId` column of its own — tenant isolation
 * is transitive via `inboxTeamId -> InboxTeam.workspaceId`, enforced with an
 * inner join rather than trusting the caller's `inboxTeamId` alone.
 */
class InboxTeamMemberRepository {
  async listUserIdsByTeamId(props: {
    workspaceId: string
    inboxTeamId: string
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { workspaceId, inboxTeamId, tx = db } = props
    const rows = await tx
      .select({ userId: inboxTeamMemberModel.userId })
      .from(inboxTeamMemberModel)
      .innerJoin(
        inboxTeamModel,
        eq(inboxTeamMemberModel.inboxTeamId, inboxTeamModel.id),
      )
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          eq(inboxTeamMemberModel.inboxTeamId, inboxTeamId),
        ),
      )
    return rows.map((row) => row.userId)
  }

  async listUserIdsByTeamIds(props: {
    workspaceId: string
    inboxTeamIds: string[]
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { workspaceId, inboxTeamIds, tx = db } = props
    if (inboxTeamIds.length === 0) {
      return []
    }

    const rows = await tx
      .select({ userId: inboxTeamMemberModel.userId })
      .from(inboxTeamMemberModel)
      .innerJoin(
        inboxTeamModel,
        eq(inboxTeamMemberModel.inboxTeamId, inboxTeamModel.id),
      )
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          inArray(inboxTeamMemberModel.inboxTeamId, inboxTeamIds),
        ),
      )
    return rows.map((row) => row.userId)
  }

  /**
   * Names of the workspace's teams a user belongs to. Bounded by that user's
   * own memberships; the workspace is enforced through the team join.
   */
  async listTeamNamesByUserId(props: {
    workspaceId: string
    userId: string
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { workspaceId, userId, tx = db } = props
    const rows = await tx
      .select({ name: inboxTeamModel.name })
      .from(inboxTeamMemberModel)
      .innerJoin(
        inboxTeamModel,
        eq(inboxTeamMemberModel.inboxTeamId, inboxTeamModel.id),
      )
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          eq(inboxTeamMemberModel.userId, userId),
        ),
      )
      .orderBy(asc(inboxTeamModel.name))
    return rows.map((row) => row.name)
  }

  /**
   * This membership lookup must not be cached: every member-token request
   * relies on the current team set to preserve revocation semantics.
   */
  async listTeamIdsByUserId(props: {
    workspaceId: string
    userId: string
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { workspaceId, userId, tx = db } = props
    const rows = await tx
      .select({ inboxTeamId: inboxTeamMemberModel.inboxTeamId })
      .from(inboxTeamMemberModel)
      .innerJoin(
        inboxTeamModel,
        eq(inboxTeamMemberModel.inboxTeamId, inboxTeamModel.id),
      )
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          eq(inboxTeamMemberModel.userId, userId),
        ),
      )
    return rows.map((row) => row.inboxTeamId)
  }
}

export const inboxTeamMemberRepository = new InboxTeamMemberRepository()
