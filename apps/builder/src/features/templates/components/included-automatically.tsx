"use client"

import { useTranslations } from "next-intl"

type Dependencies = {
  includedDependencies: { category: string; sourceId: string; name: string }[]
  manifests: { kind: string; count: number; names: string[] }[]
}

type IncludedAutomaticallyProps = {
  dependencies: Dependencies | undefined
} & (
  | {
      category: string
      excludeKinds?: undefined
    }
  | {
      category?: undefined
      excludeKinds: ReadonlySet<string>
    }
)

/** Inboxes are not copied: the installer picks their own in the install step. */
const NOT_CARRIED_KINDS: ReadonlySet<string> = new Set(["inboxes"])

/**
 * Read-only note of what the template takes along without being selected: the
 * rows a selected one needs, and the tags, custom fields, folders and the like
 * the snapshot ships. It is the server's own computation, so what is listed is
 * what the saved template will contain.
 */
export function IncludedAutomatically({
  dependencies,
  category,
  excludeKinds,
}: IncludedAutomaticallyProps) {
  const t = useTranslations("templates.form.includedAutomatically")
  const tCategories = useTranslations("templates.categories")
  if (!dependencies) {
    return null
  }
  const kindLabel = (kind: string) => {
    if (tCategories.has(kind)) {
      return tCategories(kind)
    }
    return t.has(`kind.${kind}`) ? t(`kind.${kind}`) : kind
  }
  const rows = category
    ? dependencies.includedDependencies.filter(
        (item) => item.category === category,
      )
    : []
  const shipped = dependencies.manifests.filter(
    (manifest) =>
      !NOT_CARRIED_KINDS.has(manifest.kind) &&
      (category
        ? manifest.kind === category
        : !excludeKinds?.has(manifest.kind)),
  )
  if (rows.length === 0 && shipped.length === 0) {
    return null
  }
  return (
    <section className="mt-3 flex flex-col gap-1 rounded-md border border-dashed p-3 text-sm">
      <p className="font-medium">{t("title")}</p>
      <p className="text-muted-foreground text-xs">{t("hint")}</p>
      <ul className="flex flex-col gap-0.5 text-muted-foreground text-xs">
        {rows.length > 0 && (
          <li>
            {t("rows", { count: rows.length })}
            <ul className="mt-0.5 ml-4 list-disc">
              {rows.map((row) => (
                <li key={row.sourceId}>{row.name}</li>
              ))}
            </ul>
          </li>
        )}
        {shipped.map((manifest) => (
          <li key={manifest.kind}>
            {kindLabel(manifest.kind)}: {manifest.names.join(", ")}
          </li>
        ))}
      </ul>
    </section>
  )
}
