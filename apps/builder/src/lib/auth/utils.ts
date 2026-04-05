"use server"

import { db } from "@chatbotx.io/database/client"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { headers } from "next/headers"
import { ChatbotXException } from "../errors/exception"
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
        // stripeCustomerId: session.user.stripeCustomerId || null,
      }
    : null
}

export const assertCurrentUserCanAccessChatbot = async (
  workspaceId: string,
) => {
  const userAndChatbots = await getCurrentUserAndTargetChatbot(workspaceId)

  if (!userAndChatbots) {
    throw new ChatbotXException("User is not associated with this workspace")
  }
}

export const getCurrentUserAndAllLinkedChatbots = async (): Promise<{
  user: UserModel
  allChatbots: WorkspaceModel[]
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
    allChatbots: workspaceMembers.map(
      (workspaceMember) => workspaceMember.workspace,
    ),
    allWorkspaceMembers: workspaceMembers,
  }
}

export const getCurrentUserAndTargetChatbot = async (
  workspaceId: string,
): Promise<{
  user: UserModel
  targetChatbot: WorkspaceModel
  targetWorkspaceMember: WorkspaceMemberModel
  allChatbots: WorkspaceModel[]
  allWorkspaceMembers: (WorkspaceMemberModel & { workspace: WorkspaceModel })[]
} | null> => {
  const userAndChatbots = await getCurrentUserAndAllLinkedChatbots()
  if (!userAndChatbots) {
    return null
  }

  const targetWorkspaceMember = userAndChatbots.allWorkspaceMembers.find(
    (workspaceMember) => workspaceMember.workspaceId === workspaceId,
  )
  if (!targetWorkspaceMember) {
    return null
  }

  return {
    ...userAndChatbots,
    targetChatbot: targetWorkspaceMember.workspace,
    targetWorkspaceMember,
  }
}
