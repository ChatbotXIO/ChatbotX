"use server"

import {
  resolveWorkspaceAccess,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { headers } from "next/headers"
import { cache } from "react"
import { getTenantSettings } from "@/features/tenant/utils"
import {
  canOpenWorkspaceOnHost,
  filterWorkspacesForHost,
  resolveRequestTenantId,
} from "@/lib/tenant/request-tenant"
import { auth } from "./auth"

// `tenantId` is the white-label tenant key. It is deliberately never returned by
// the auth session (see `additionalFields.tenantId.returned = false` in
// `@chatbotx.io/auth/server`), so the session-derived user never carries it.
export type SessionUser = Omit<
  UserModel,
  "tenantId" | "deletionRequestedAt" | "scheduledDeletionAt"
>

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
        mustChangePassword: session.user.mustChangePassword ?? false,
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

const getCachedCurrentUserAndAllLinkedWorkspaces = cache(
  async (): Promise<{
    user: SessionUser
    allWorkspaces: WorkspaceModel[]
    allWorkspaceMembers: (WorkspaceMemberModel & {
      workspace: WorkspaceModel
    })[]
  } | null> => {
    const user = await getCurrentUser()
    if (!user) {
      return null
    }

    const [workspaceMembers, { storageUrl }] = await Promise.all([
      workspaceMemberService.listByUserIdUncached({ userId: user.id }),
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
  },
)

/**
 * Every workspace the user belongs to, across all hosts. Only for surfaces
 * that must see them all (account deletion, account page); everything else
 * uses the host-scoped variant below.
 */
export const getCurrentUserAndAllLinkedWorkspaces = async () =>
  getCachedCurrentUserAndAllLinkedWorkspaces()

const getCachedHostScopedWorkspaces = cache(async () => {
  const all = await getCachedCurrentUserAndAllLinkedWorkspaces()
  if (!all) {
    return null
  }
  const hostTenantId = await resolveRequestTenantId()
  const allWorkspaceMembers = all.allWorkspaceMembers.filter(
    (member) =>
      filterWorkspacesForHost([member.workspace], hostTenantId).length,
  )
  return {
    ...all,
    allWorkspaces: allWorkspaceMembers.map((member) => member.workspace),
    allWorkspaceMembers,
  }
})

/** The user's workspaces that belong to the tenant of the request host. */
export const getCurrentUserAndHostScopedWorkspaces = async () =>
  getCachedHostScopedWorkspaces()

type CurrentUserAndTargetWorkspace = {
  user: SessionUser
  targetWorkspace: WorkspaceModel
  targetWorkspaceMember: WorkspaceMemberModel
  isSupportSession: boolean
  allWorkspaces: WorkspaceModel[]
  allWorkspaceMembers: (WorkspaceMemberModel & { workspace: WorkspaceModel })[]
}

const getCachedCurrentUserAndTargetWorkspace = cache(
  async (
    workspaceId: string,
  ): Promise<CurrentUserAndTargetWorkspace | null> => {
    const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
    if (!userAndWorkspaces) {
      return null
    }

    const realMember = userAndWorkspaces.allWorkspaceMembers.find(
      (workspaceMember) => workspaceMember.workspaceId === workspaceId,
    )

    const access = await resolveWorkspaceAccess({
      realMember,
      workspaceId,
      user: userAndWorkspaces.user,
    })
    if (!access) {
      return null
    }

    if (
      !canOpenWorkspaceOnHost({
        workspaceTenantId: access.workspace.tenantId,
        hostTenantId: await resolveRequestTenantId(),
        isSupportSession: access.isSupportSession,
      })
    ) {
      return null
    }

    return {
      ...userAndWorkspaces,
      ...(await getCachedHostScopedWorkspaces()),
      targetWorkspace: access.workspace,
      targetWorkspaceMember: access.member,
      isSupportSession: access.isSupportSession,
    }
  },
)

export const getCurrentUserAndTargetWorkspace = async (
  workspaceId: string,
): Promise<CurrentUserAndTargetWorkspace | null> =>
  getCachedCurrentUserAndTargetWorkspace(workspaceId)
