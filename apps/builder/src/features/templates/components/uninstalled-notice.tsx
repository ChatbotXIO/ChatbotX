"use client"

import type {
  TemplateUninstallCounts,
  TemplateUninstallRequester,
} from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"

type UninstalledNoticeProps = {
  /** Left out (the publisher's view) to show the counts without the requester. */
  uninstalledBy?: TemplateUninstallRequester | null
  counts: TemplateUninstallCounts
  /** One line for a table cell; otherwise a banner with the full breakdown. */
  compact?: boolean
}

/**
 * Says who uninstalled the template and what became of the copies: the numbers
 * are the ones the uninstall recorded, so the installer sees what was deleted
 * and what they still own.
 */
export function UninstalledNotice({
  uninstalledBy,
  counts,
  compact = false,
}: UninstalledNoticeProps) {
  const t = useTranslations("templates.installs")
  const tUninstall = useTranslations("templates.uninstall")
  const kept =
    counts.keptModified +
    counts.keptShared +
    counts.keptByPolicy +
    counts.keptHasDependents +
    counts.keptPartlyRemoved +
    counts.keptLockedByOther
  const who = t("uninstalledBy", { by: uninstalledBy ?? "unknown" })

  if (compact) {
    const summary = t("uninstalledSummary", { deleted: counts.deleted, kept })
    return (
      <span className="text-muted-foreground text-xs">
        {uninstalledBy === undefined ? summary : `${who} ${summary}`}
      </span>
    )
  }
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
      <p className="font-medium">{who}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
        <li>{tUninstall("deletedDone", { count: counts.deleted })}</li>
        {counts.deletedModified > 0 && (
          <li>
            {tUninstall("deletedModified", { count: counts.deletedModified })}
          </li>
        )}
        {counts.deletedUnverified > 0 && (
          <li>
            {tUninstall("deletedUnverified", {
              count: counts.deletedUnverified,
            })}
          </li>
        )}
        {counts.keptModified > 0 && (
          <li>{tUninstall("keptModified", { count: counts.keptModified })}</li>
        )}
        <li>{tUninstall("keptShared", { count: counts.keptShared })}</li>
        {counts.keptByPolicy > 0 && (
          <li>{tUninstall("keptByPolicy", { count: counts.keptByPolicy })}</li>
        )}
        {counts.keptLockedByOther > 0 && (
          <li>
            {tUninstall("keptLockedByOther", {
              count: counts.keptLockedByOther,
            })}
          </li>
        )}
        {counts.keptPartlyRemoved > 0 && (
          <li>
            {tUninstall("keptPartlyRemoved", {
              count: counts.keptPartlyRemoved,
            })}
          </li>
        )}
        {counts.keptHasDependents > 0 && (
          <li>
            {tUninstall("keptHasDependents", {
              count: counts.keptHasDependents,
            })}
          </li>
        )}
      </ul>
    </div>
  )
}
