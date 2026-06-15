"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { headers } from "next/headers"
import { getTenantSettings } from "@/features/tenant/utils"
import { auth } from "./auth"

// `tenantId` is the white-label tenant key. It is deliberately never returned by
// the auth session (see `additionalFields.tenantId.returned = false` in
// `@chatbotx.io/auth/server`), so the session-derived user never carries it.
export type SessionUser = Omit<UserModel, "tenantId">

export const getCurrentUserId = async (): Promise<string | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user.id || null
}

export const getCurrentUser = async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user
    ? {
        ...session.user,
        image: session.user.image || null,
        isAnonymous: session.user.isAnonymous ?? false,
      }
    : null
}

export const assertCurrentUserCanAccessChatbot = async (
  workspaceId: string,
) => {
  const userAndWorkspaces = await getCurrentUserAndTargetWorkspace(workspaceId)

  if (!userAndWorkspaces) {
    throw new ChatbotXException("User is not associated with this workspace")
  }
}

export const getCurrentUserAndAllLinkedWorkspaces = async (): Promise<{
  user: SessionUser
  allWorkspaces: WorkspaceModel[]
  allWorkspaceMembers: (WorkspaceMemberModel & { workspace: WorkspaceModel })[]
} | null> => {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const [workspaceMembers, { storageUrl }] = await Promise.all([
    db.query.workspaceMemberModel.findMany({
      where: {
        userId: user.id,
      },
      with: {
        workspace: true,
      },
    }),
    getTenantSettings(),
  ])

  const resolveLogoUrl = (logo: string | null) =>
    logo ? new URL(logo, storageUrl).toString() : null

  const membersWithResolvedLogos = workspaceMembers.map((member) => ({
    ...member,
    workspace: {
      ...member.workspace,
      logo: resolveLogoUrl(member.workspace.logo),
    },
  }))

  return {
    user,
    allWorkspaces: membersWithResolvedLogos.map(
      (workspaceMember) => workspaceMember.workspace,
    ),
    allWorkspaceMembers: membersWithResolvedLogos,
  }
}

export const getCurrentUserAndTargetWorkspace = async (
  workspaceId: string,
): Promise<{
  user: SessionUser
  targetWorkspace: WorkspaceModel
  targetWorkspaceMember: WorkspaceMemberModel
  allWorkspaces: WorkspaceModel[]
  allWorkspaceMembers: (WorkspaceMemberModel & { workspace: WorkspaceModel })[]
} | null> => {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    return null
  }

  const targetWorkspaceMember = userAndWorkspaces.allWorkspaceMembers.find(
    (workspaceMember) => workspaceMember.workspaceId === workspaceId,
  )
  if (!targetWorkspaceMember) {
    return null
  }

  return {
    ...userAndWorkspaces,
    targetWorkspace: targetWorkspaceMember.workspace,
    targetWorkspaceMember,
  }
}
