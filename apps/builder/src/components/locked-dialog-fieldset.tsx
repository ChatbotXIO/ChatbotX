"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useIsLocked } from "@/features/templates/components/lock-context"

type LockedDialogFieldsetProps = {
  resourceId?: string | null
  children: ReactNode
}

/**
 * Client counterpart of `LockedEditorGuard` for edit dialogs under a
 * `LockedIdsProvider`: disables every control, Save included. The write paths
 * refuse locked edits anyway, so this only spares a failed save.
 */
export function LockedDialogFieldset({
  resourceId,
  children,
}: LockedDialogFieldsetProps) {
  const t = useTranslations("templates.locked")
  const isLocked = useIsLocked(resourceId)
  if (!isLocked) {
    return <>{children}</>
  }
  return (
    <>
      <div
        className="rounded-md border bg-muted px-4 py-2 text-muted-foreground text-sm"
        data-testid="template-locked-banner"
        role="status"
      >
        {t("editorBanner")}
      </div>
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        data-testid="template-locked-editor"
        disabled
      >
        {children}
      </fieldset>
    </>
  )
}
