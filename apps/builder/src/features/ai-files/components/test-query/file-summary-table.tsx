"use client"

import type { AIFileWithProcessing } from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { z } from "zod"
import type { searchAIFilesResponse } from "../../schema/public"

type SearchResponse = z.output<typeof searchAIFilesResponse>

const strategyKey = {
  prose: "aiFiles.chunking.strategy.prose",
  tabular: "aiFiles.chunking.strategy.tabular",
  markdown: "aiFiles.chunking.strategy.markdown",
} as const satisfies Record<
  NonNullable<AIFileWithProcessing["chunking"]>["strategy"],
  string
>

export function FileSummaryTable({
  files,
  result,
  workspaceId,
}: {
  files: AIFileWithProcessing[]
  result: SearchResponse
  workspaceId: string
}) {
  const t = useTranslations()
  const fileById = new Map(files.map((file) => [file.id, file]))

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-sm">{t("aiFiles.testQuery.byFile")}</h3>
      <ul className="divide-y rounded-md border">
        {result.files.map((summary) => {
          const file = fileById.get(summary.id)
          const matches = result.results.filter(
            (item) => item.fileId === summary.id,
          )
          const bestRank = matches.reduce<number | null>(
            (best, item) =>
              best === null || item.rank < best ? item.rank : best,
            null,
          )
          const href = `/space/${workspaceId}/ai-files/${summary.id}`
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              key={summary.id}
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{summary.name}</p>
                <p className="text-muted-foreground">
                  {t("aiFiles.testQuery.matches", { count: matches.length })}
                  {bestRank === null
                    ? ""
                    : ` · ${t("aiFiles.testQuery.bestRank", { rank: bestRank })}`}
                  {` · ${summary.readyChunks}/${summary.chunksCount}`}
                </p>
                {file?.chunking ? (
                  <p className="text-muted-foreground">
                    {t(strategyKey[file.chunking.strategy])} ·{" "}
                    {file.chunking.chunkSize}/{file.chunking.overlapSize}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {file?.chunkingOutdated || file?.indexOutdated ? (
                  <Badge variant="outline">
                    {t("aiFiles.testQuery.needsReindex")}
                  </Badge>
                ) : null}
                <Button
                  nativeButton={false}
                  render={<Link href={href} />}
                  size="sm"
                  variant="outline"
                >
                  {t("aiFiles.testQuery.openDetail")}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
