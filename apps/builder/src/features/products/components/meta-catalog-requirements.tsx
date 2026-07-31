import { useTranslations } from "next-intl"

const REQUIREMENT_KEYS = ["description", "image", "video", "price"] as const

/**
 * Meta rejects catalog items that miss any of these, so the checklist is shown
 * before the sync action rather than after a run fails.
 */
export function MetaCatalogRequirements() {
  const t = useTranslations("metaCatalog.requirements")

  return (
    <section className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <p className="font-medium text-sm">{t("intro")}</p>
      <ul className="ms-4 list-disc space-y-1.5 text-muted-foreground text-sm marker:text-muted-foreground/60">
        {REQUIREMENT_KEYS.map((key) => (
          <li key={key}>
            <span className="font-medium text-foreground">
              {t(`${key}.label`)}
            </span>
            {": "}
            {t(`${key}.value`)}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">{t("minimumItems")}</p>
    </section>
  )
}
