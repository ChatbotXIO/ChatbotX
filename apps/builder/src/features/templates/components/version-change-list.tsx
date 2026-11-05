"use client"

import type { TemplateVersionChange } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useOptionalLabel } from "../lib/use-optional-label"

const CHANGE_KINDS = ["added", "changed", "removed"] as const

const CHANGE_LABEL_KEY = {
  added: "templates.versions.added",
  changed: "templates.versions.changed",
  removed: "templates.versions.removed",
} as const satisfies Record<(typeof CHANGE_KINDS)[number], string>

/** What a version changed, by category and name. */
export function VersionChangeList({
  changes,
}: {
  changes: TemplateVersionChange[]
}) {
  const t = useTranslations()
  const categoryLabel = useOptionalLabel("templates.categories")

  return (
    <ul className="flex flex-col gap-1">
      {changes.map((change) => (
        <li key={change.category}>
          <span className="font-medium">{categoryLabel(change.category)}</span>
          {CHANGE_KINDS.filter((kind) => change[kind].length > 0).map(
            (kind) => (
              <p className="break-words text-muted-foreground" key={kind}>
                {t(CHANGE_LABEL_KEY[kind])}: {change[kind].join(", ")}
              </p>
            ),
          )}
        </li>
      ))}
    </ul>
  )
}
