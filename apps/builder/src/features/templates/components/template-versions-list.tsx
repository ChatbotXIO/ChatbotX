import type { TemplateVersionHistoryItem } from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { getTranslations } from "next-intl/server"
import { formatDateTime } from "../lib/format-date-time"
import { VersionChangeList } from "./version-change-list"

/** What each saved version of a template did, newest first. */
export async function TemplateVersionsList({
  versions,
  currentVersion,
}: {
  versions: TemplateVersionHistoryItem[]
  currentVersion: number
}) {
  const t = await getTranslations()

  return (
    <ol className="flex flex-col gap-3">
      {versions.map((item) => (
        <li key={item.version}>
          <Card>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t("templates.versions.versionNumber", {
                    version: item.version,
                  })}
                </span>
                {item.version === currentVersion && (
                  <Badge variant="secondary">
                    {t("templates.versions.current")}
                  </Badge>
                )}
                <span className="ms-auto text-muted-foreground tabular-nums">
                  {formatDateTime(item.createdAt)}
                </span>
              </div>
              {item.changes?.length ? (
                <VersionChangeList changes={item.changes} />
              ) : (
                <p className="text-muted-foreground">
                  {item.version === 1
                    ? t("templates.versions.first")
                    : t("templates.versions.noDetail")}
                </p>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  )
}
