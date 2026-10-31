"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useIsLocked } from "@/features/templates/components/lock-badge"

type LockedDialogFieldsetProps = {
  /** The row being edited; omit (or pass undefined) when creating. */
  resourceId?: string | null
  children: ReactNode
}

/**
 * Client counterpart of `LockedEditorGuard` for edit dialogs rendered inside a
 * list that sits under a `LockedIdsProvider`. A row installed from a View-only
 * template opens with a notice and every control inside disabled (Save
 * included). The write paths refuse locked edits on their own, so this only
 * spares the user a failed save.
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
