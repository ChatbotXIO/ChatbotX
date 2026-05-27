"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { headers } from "next/headers"
import { auth } from "./auth"

export const getCurrentUserId = async (): Promise<string | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user.id || null
}

export const getCurrentUser = async (): Promise<UserModel | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user
    ? {
        ...session.user,
        image: session.user.image || null,
        isAnonymous: session.user.isAnonymous ?? false,
        // Better-Auth additionalFields são `string | null | undefined`; o
        // UserModel do Drizzle exige `string` (notNull) — coerce default.
        activityStatus: session.user.activityStatus ?? "available",
        lastActiveAt: session.user.lastActiveAt ?? null,
        // stripeCustomerId: session.user.stripeCustomerId || null,
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
  user: UserModel
  allWorkspaces: WorkspaceModel[]
  allWorkspaceMembers: (WorkspaceMemberModel & { workspace: WorkspaceModel })[]
} | null> => {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const workspaceMembers = await db.query.workspaceMemberModel.findMany({
    where: {
      userId: user.id,
    },
    with: {
      workspace: true,
    },
  })

  return {
    user,
    allWorkspaces: workspaceMembers.map(
      (workspaceMember) => workspaceMember.workspace,
    ),
    allWorkspaceMembers: workspaceMembers,
  }
}

export const getCurrentUserAndTargetWorkspace = async (
  workspaceId: string,
): Promise<{
  user: UserModel
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
