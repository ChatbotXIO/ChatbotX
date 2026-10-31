import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { getTranslations } from "next-intl/server"

type InstallsByVersionProps = {
  /** Active installations grouped by the template version they run. */
  byVersion: { version: number; count: number }[]
  /** The template's newest version, to flag the copies that are behind. */
  currentVersion: number
}

/**
 * Labelled horizontal bars, newest version first: how many active copies run
 * each version. Bars share one scale starting at zero and carry their count,
 * so nothing relies on colour alone.
 */
export async function InstallsByVersion({
  byVersion,
  currentVersion,
}: InstallsByVersionProps) {
  const t = await getTranslations("templates.installers")
  if (byVersion.length === 0) {
    return null
  }
  const rows = [...byVersion].sort((a, b) => b.version - a.version)
  const max = Math.max(...rows.map((row) => row.count))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("byVersionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const isBehind = row.version < currentVersion
            return (
              <li
                className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-sm"
                key={row.version}
              >
                <span className="tabular-nums">
                  {t("versionLabel", { version: row.version })}
                </span>
                <span
                  aria-hidden="true"
                  className="h-3 overflow-hidden rounded-sm bg-muted"
                >
                  <span
                    className={`block h-full rounded-sm ${isBehind ? "bg-muted-foreground/60" : "bg-primary"}`}
                    style={{ width: `${(row.count / max) * 100}%` }}
                  />
                </span>
                <span className="text-end font-medium tabular-nums">
                  {row.count}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-muted-foreground text-xs">
          {t("byVersionHint", { version: currentVersion })}
        </p>
      </CardContent>
    </Card>
  )
}
