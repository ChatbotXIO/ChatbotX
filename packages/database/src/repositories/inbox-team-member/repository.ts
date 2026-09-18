import { and, type DatabaseClient, db, eq } from "../../client"
import { inboxTeamMemberModel, inboxTeamModel } from "../../schema"

/**
 * Bounded projection over `InboxTeamMember` — never the whole (cached)
 * `inboxTeamService.listByWorkspace`, which loads every team with members
 * and users. Used by the P2 ring-target snapshot
 * (`whatsappVoipCallService.selectRingTargetsForCall`) only when a
 * conversation's `assignedInboxTeamId` is set. `InboxTeamMember` has no
 * `workspaceId` column of its own — tenant isolation is transitive via
 * `inboxTeamId -> InboxTeam.workspaceId`, enforced here with an inner join
 * rather than trusting the caller's `inboxTeamId` alone.
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
}

export const inboxTeamMemberRepository = new InboxTeamMemberRepository()
