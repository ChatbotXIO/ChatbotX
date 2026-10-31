import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { listLockedTemplateResourceIds } from "../queries/list-locked-ids"
import { LockedEditorProvider } from "./lock-badge"

type LockedEditorGuardProps = {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceId: string
  children: ReactNode
}

/**
 * Wraps an editor page. A copy installed from a View-only template opens with a
 * notice and marks the page locked for the client forms underneath: each form
 * disables only the controls of its content keys (`LockedContent`), so
 * installer-owned controls and Save stay usable. The write paths refuse locked
 * edits on their own (`templateAllowEditViolation`), so this only spares the
 * user a failed save.
 */
export async function LockedEditorGuard({
  workspaceId,
  resourceKind,
  resourceId,
  children,
}: LockedEditorGuardProps) {
  const { lockedIds } = await listLockedTemplateResourceIds({
    workspaceId,
    resourceKind,
    resourceIds: [resourceId],
  })
  if (lockedIds.length === 0) {
    return <>{children}</>
  }
  const t = await getTranslations("templates.locked")
  return (
    <LockedEditorProvider locked>
      <div
        className="mb-4 rounded-md border bg-muted px-4 py-2 text-muted-foreground text-sm"
        data-testid="template-locked-banner"
        role="status"
      >
        {t("editorBanner")}
      </div>
      {children}
    </LockedEditorProvider>
  )
}
