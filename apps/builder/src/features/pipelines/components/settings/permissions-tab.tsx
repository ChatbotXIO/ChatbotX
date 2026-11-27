"use client"

import type { PipelineGrantPolicy } from "@chatbotx.io/business/pipeline"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useTranslations } from "next-intl"
import { useWorkspaceMembers } from "@/features/users/provider/user-hook"
import { CheckboxField } from "../shared/checkbox-field"
import {
  NO_PERMISSIONS,
  type PermissionDraft,
  type PermissionFlags,
} from "./settings-draft"

const PERMISSION_FLAGS = [
  { key: "canView", labelKey: "settings.permission.view" },
  { key: "canEdit", labelKey: "settings.permission.edit" },
  { key: "canDelete", labelKey: "settings.permission.delete" },
  { key: "canManageSettings", labelKey: "settings.permission.settings" },
] as const

export type GrantLimits = {
  /** The caller's own permissions on this pipeline. */
  held: PermissionFlags
  policy: PipelineGrantPolicy
}

/**
 * Whether the caller may change `memberId`'s row from `flags` by setting
 * `flag` to `checked`. Mirrors the server: a limited caller (plain member
 * managing settings) never edits their own row, and every flag the row keeps
 * enabled must be one they hold, so a row granting more than the caller holds
 * can only be revoked as a whole.
 */
export const canSetFlag = (
  limits: GrantLimits,
  memberId: string,
  flags: PermissionFlags,
  flag: keyof PermissionFlags,
  checked: boolean,
) => {
  if (!limits.policy.limited) {
    return true
  }
  if (memberId === limits.policy.selfMemberId) {
    return false
  }
  const next = { ...flags, [flag]: checked }
  return (Object.keys(next) as Array<keyof PermissionFlags>).every(
    (key) => !next[key] || limits.held[key],
  )
}

type PermissionsTabProps = {
  workspaceId: string
  /** Saved grants by workspace member id; undefined until they load. */
  grants: ReadonlyMap<string, PermissionFlags> | undefined
  isError: boolean
  onRetry: () => void
  draft: PermissionDraft
  onChange: (workspaceMemberId: string, flags: PermissionFlags) => void
  disabled: boolean
  grantLimits: GrantLimits
}

export function PermissionsTab({
  workspaceId,
  grants,
  isError,
  onRetry,
  draft,
  onChange,
  disabled,
  grantLimits,
}: PermissionsTabProps) {
  const t = useTranslations("pipelines")
  const membersQuery = useWorkspaceMembers(workspaceId)
  const allMembers = membersQuery.data ?? []
  // Owners and admins bypass per-pipeline grants, so a row for them would mislead.
  const members = allMembers.filter(
    (member) => member.role !== "owner" && !member.permissions?.superAdmin,
  )
  const hasError = isError || membersQuery.isError
  // Rows render only once grants and members loaded: a member without a grant reads unchecked.
  const savedGrants = hasError || membersQuery.isPending ? undefined : grants

  return (
    <div className="grid gap-3 py-4 text-sm">
      <p className="text-muted-foreground text-xs">
        {t("settings.permissionsHint")}
      </p>
      {hasError ? (
        // Without the real grants every box would read unchecked and Save would overwrite them.
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3">
          <p className="text-destructive text-xs">{t("board.error")}</p>
          <Button
            onClick={() => {
              onRetry()
              membersQuery.refetch()
            }}
            size="sm"
            variant="outline"
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {savedGrants || hasError ? null : <Skeleton className="h-20 w-full" />}
      {savedGrants && members.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("settings.noMembers")}
        </p>
      ) : null}
      {(savedGrants ? members : []).map((member) => {
        const flags =
          draft[member.id] ?? savedGrants?.get(member.id) ?? NO_PERMISSIONS
        const hasAny = Object.values(flags).some(Boolean)
        return (
          <div className="grid gap-2 rounded-lg border p-3" key={member.id}>
            <div className="flex min-h-8 items-center justify-between">
              <span className="font-medium">{member.user?.name ?? "--"}</span>
              {hasAny ? (
                <Button
                  disabled={
                    disabled ||
                    (grantLimits.policy.limited &&
                      grantLimits.policy.selfMemberId === member.id)
                  }
                  onClick={() => onChange(member.id, NO_PERMISSIONS)}
                  size="sm"
                  variant="ghost"
                >
                  {t("settings.revoke")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-4">
              {PERMISSION_FLAGS.map(({ key, labelKey }) => (
                <CheckboxField
                  checked={flags[key]}
                  disabled={
                    disabled ||
                    !canSetFlag(grantLimits, member.id, flags, key, !flags[key])
                  }
                  key={key}
                  onCheckedChange={(checked) =>
                    onChange(member.id, { ...flags, [key]: checked })
                  }
                >
                  {t(labelKey)}
                </CheckboxField>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
