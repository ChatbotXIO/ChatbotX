import type { WorkspaceMemberModel } from "@chatbotx.io/database/types"
import { createAccessControl } from "better-auth/plugins/access"

const statements = {
  organization: ["read", "update", "delete"],
  workspace: ["create", "read", "update", "delete"],
  workspaceMember: ["invite", "update", "remove"],
} as const

const ac = createAccessControl(statements)

const organizationRoles = {
  owner: ac.newRole({
    organization: ["read", "update", "delete"],
    workspace: ["create", "read", "update", "delete"],
    workspaceMember: ["invite", "update", "remove"],
  }),
  admin: ac.newRole({
    organization: ["read", "update"],
    workspace: ["create", "read", "update"],
    workspaceMember: ["invite", "update", "remove"],
  }),
  member: ac.newRole({
    organization: ["read"],
    workspace: ["read"],
    workspaceMember: [],
  }),
} as const

const workspaceRoles = {
  owner: ac.newRole({
    workspace: ["read", "update", "delete"],
    workspaceMember: ["invite", "update", "remove"],
  }),
  admin: ac.newRole({
    workspace: ["read", "update"],
    workspaceMember: ["invite", "update", "remove"],
  }),
  member: ac.newRole({
    workspace: ["read"],
    workspaceMember: [],
  }),
} as const

type Resource = keyof typeof statements
type Action<R extends Resource> = (typeof statements)[R][number]
type RequiredPermissions = {
  [R in Resource]?: Action<R>[]
}

const hasPermission = (
  roleStatements: Partial<Record<Resource, readonly string[]>>,
  requiredPermissions: RequiredPermissions,
): boolean => {
  return Object.entries(requiredPermissions).every(([resource, actions]) => {
    if (!actions || actions.length === 0) {
      return true
    }

    const allowedActions = roleStatements[resource as Resource] ?? []
    return actions.every((action) => allowedActions.includes(action))
  })
}

export const organizationPermissions = {
  createWorkspace: {
    workspace: ["create"],
  } satisfies RequiredPermissions,
} as const

export const workspacePermissions = {
  inviteMember: {
    workspaceMember: ["invite"],
  } satisfies RequiredPermissions,
  updateMember: {
    workspaceMember: ["update"],
  } satisfies RequiredPermissions,
  removeMember: {
    workspaceMember: ["remove"],
  } satisfies RequiredPermissions,
} as const

export const resolveOrganizationRole = (role: string | null | undefined) => {
  if (role === "owner" || role === "admin" || role === "member") {
    return organizationRoles[role]
  }

  return organizationRoles.member
}

export const resolveWorkspaceRole = (
  workspaceMember: Pick<WorkspaceMemberModel, "role" | "permissions">,
) => {
  if (workspaceMember.role === "owner") {
    return workspaceRoles.owner
  }

  if (workspaceMember.permissions.superAdmin) {
    return workspaceRoles.admin
  }

  return workspaceRoles.member
}

export const canAccessOrganization = (
  role: string | null | undefined,
  requiredPermissions: RequiredPermissions,
): boolean => {
  return hasPermission(
    resolveOrganizationRole(role).statements as Partial<
      Record<Resource, readonly string[]>
    >,
    requiredPermissions,
  )
}

export const canAccessWorkspace = (
  workspaceMember: Pick<WorkspaceMemberModel, "role" | "permissions">,
  requiredPermissions: RequiredPermissions,
): boolean => {
  return hasPermission(
    resolveWorkspaceRole(workspaceMember).statements as Partial<
      Record<Resource, readonly string[]>
    >,
    requiredPermissions,
  )
}
