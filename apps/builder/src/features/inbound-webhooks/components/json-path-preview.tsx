"use client"

import {
  readJsonPath,
  stringifyJsonPathValue,
} from "@chatbotx.io/utils/json-path"
import { useTranslations } from "next-intl"

/**
 * The "Result: …" line under a JSON path: what `path` reads from the loaded
 * sample. Renders nothing until there is both a sample and a path.
 */
export const JsonPathPreview = ({
  path,
  sample,
}: {
  path: string
  sample: unknown
}) => {
  const t = useTranslations("inboundWebhooks.picker")
  if (!path.trim() || typeof sample !== "object" || sample === null) {
    return null
  }
  const preview = stringifyJsonPathValue(readJsonPath(sample, path))
  return (
    <p className="truncate text-muted-foreground text-xs">
      {t("result")}{" "}
      {preview === undefined ? (
        <span className="italic">{t("noValue")}</span>
      ) : (
        <span className="font-mono text-foreground">{preview}</span>
      )}
    </p>
  )
}
