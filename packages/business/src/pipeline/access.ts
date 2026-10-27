import type { PipelineMemberModel } from "@chatbotx.io/database/types"

/**
 * Who is asking, as plain data. The app layer resolves it from the session or
 * the workspace token; the business layer never sees a request.
 * - `workspaceToken`: a scoped workspace API token — the token scope is the gate.
 * - `system`: the workspace's own automation (flow steps), not a caller.
 * - `support`: a platform support session, full access like an owner.
 * - `member`: a workspace member; admins/owners bypass the per-pipeline ACL.
 *   `canViewContactEmailAndPhone` is the member's contact permission: without
 *   it, item contacts come back without email and phone (as in the contacts list).
 */
export type PipelineAccessScope =
  | { kind: "workspaceToken" }
  | { kind: "system" }
  | { kind: "support" }
  | {
      kind: "member"
      workspaceMemberId: string
      isWorkspaceAdmin: boolean
      canViewContactEmailAndPhone: boolean
    }

export type PipelinePermissions = {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canManageSettings: boolean
}

export type PipelineAction = "view" | "edit" | "delete" | "manageSettings"

const ACTION_PERMISSION = {
  view: "canView",
  edit: "canEdit",
  delete: "canDelete",
  manageSettings: "canManageSettings",
} as const satisfies Record<PipelineAction, keyof PipelinePermissions>

export const FULL_PIPELINE_PERMISSIONS: PipelinePermissions = {
  canView: true,
  canEdit: true,
  canDelete: true,
  canManageSettings: true,
}

export const NO_PIPELINE_PERMISSIONS: PipelinePermissions = {
  canView: false,
  canEdit: false,
  canDelete: false,
  canManageSettings: false,
}

/** Tokens and support sessions see contact PII; a member only with the permission. */
export const canViewContactEmailAndPhone = (
  scope: PipelineAccessScope,
): boolean => scope.kind !== "member" || scope.canViewContactEmailAndPhone

/** Tokens, support sessions and workspace admins are not governed by member rows. */
const bypassesPipelineAcl = (scope: PipelineAccessScope): boolean =>
  scope.kind !== "member" || scope.isWorkspaceAdmin

/**
 * Effective permissions of a scope on one pipeline. A plain member holds only
 * what their `PipelineMember` row grants; without a row they hold nothing.
 */
export function resolvePipelinePermissions(
  scope: PipelineAccessScope,
  memberRow: Pick<
    PipelineMemberModel,
    "canView" | "canEdit" | "canDelete" | "canManageSettings"
  > | null,
): PipelinePermissions {
  if (bypassesPipelineAcl(scope)) {
    return FULL_PIPELINE_PERMISSIONS
  }
  return memberRow
    ? normalizePipelinePermissions({
        canView: memberRow.canView,
        canEdit: memberRow.canEdit,
        canDelete: memberRow.canDelete,
        canManageSettings: memberRow.canManageSettings,
      })
    : NO_PIPELINE_PERMISSIONS
}

/** Editing, deleting or managing settings is meaningless without viewing. */
export function normalizePipelinePermissions(
  permissions: PipelinePermissions,
): PipelinePermissions {
  const needsView =
    permissions.canEdit ||
    permissions.canDelete ||
    permissions.canManageSettings
  return { ...permissions, canView: permissions.canView || needsView }
}

export const permitsPipelineAction = (
  permissions: PipelinePermissions,
  action: PipelineAction,
): boolean => permissions[ACTION_PERMISSION[action]]

/**
 * What the caller may grant in the member editor: a plain member who manages
 * settings can only share flags they hold and never edit their own row (the
 * rule `assertCanGrant` enforces); admins, tokens and support are unlimited.
 */
export type PipelineGrantPolicy =
  | { limited: false }
  | { limited: true; selfMemberId: string }

export const pipelineGrantPolicy = (
  scope: PipelineAccessScope,
): PipelineGrantPolicy =>
  scope.kind === "member" && !scope.isWorkspaceAdmin
    ? { limited: true, selfMemberId: scope.workspaceMemberId }
    : { limited: false }
