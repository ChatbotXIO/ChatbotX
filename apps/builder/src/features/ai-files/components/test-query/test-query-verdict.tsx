"use client"

import { useFormatter, useTranslations } from "next-intl"
import type { z } from "zod"
import type { TestQueryComparison } from "../../lib/test-query-history"
import type { searchAIFilesResponse } from "../../schema/public"

type SearchResponse = z.output<typeof searchAIFilesResponse>

const verdictKey = {
  inTopResults: "aiFiles.testQuery.verdict.inTopResults",
  foundButLowRank: "aiFiles.testQuery.verdict.foundButLowRank",
  notInAnyChunk: "aiFiles.testQuery.verdict.notInAnyChunk",
} as const satisfies Record<
  NonNullable<SearchResponse["expected"]>["verdict"],
  string
>

const diagnosisKey = {
  ok: "aiFiles.testQuery.diagnosis.ok",
  noReadyChunks: "aiFiles.testQuery.diagnosis.noReadyChunks",
  allBelowThreshold: "aiFiles.testQuery.diagnosis.allBelowThreshold",
  noMatches: "aiFiles.testQuery.diagnosis.noMatches",
  agentHasNoFiles: "aiFiles.testQuery.diagnosis.agentHasNoFiles",
} as const satisfies Record<SearchResponse["diagnosis"], string>

export function TestQueryVerdict({
  comparison,
  result,
}: {
  comparison: TestQueryComparison | null
  result: SearchResponse
}) {
  const t = useTranslations()
  const format = useFormatter()
  const expected = result.expected
  const best = expected?.matches.reduce<
    NonNullable<SearchResponse["expected"]>["matches"][number] | undefined
  >((current, match) => {
    if (!current) {
      return match
    }
    if (
      match.rank !== null &&
      (current.rank === null || match.rank < current.rank)
    ) {
      return match
    }
    return current
  }, undefined)

  const time = comparison
    ? format.dateTime(new Date(comparison.at), { timeStyle: "short" })
    : ""

  return (
    <section
      aria-live="polite"
      className="space-y-2 rounded-md border bg-muted/40 p-4"
    >
      {expected ? (
        <>
          <p className="font-medium">{t(verdictKey[expected.verdict])}</p>
          {best ? (
            <p className="text-sm">
              {t("aiFiles.testQuery.answerLocation", {
                file: best.fileName,
                chunk:
                  best.chunkIndex === null
                    ? t("aiFiles.testQuery.chunkUnnumbered")
                    : t("aiFiles.testQuery.chunkNumber", {
                        index: best.chunkIndex,
                      }),
                rank: best.rank ?? 0,
              })}
            </p>
          ) : null}
          {expected.verdict === "notInAnyChunk" ? (
            <p className="text-muted-foreground text-sm">
              {t("aiFiles.testQuery.splitHint")}
            </p>
          ) : null}
        </>
      ) : (
        <p className="font-medium">{t(diagnosisKey[result.diagnosis])}</p>
      )}
      {comparison?.kind === "answerRank" ? (
        <p className="text-muted-foreground text-sm">
          {t("aiFiles.testQuery.previousRun", {
            time,
            from: comparison.from ?? "—",
            to: comparison.to ?? "—",
          })}
        </p>
      ) : null}
      {comparison?.kind === "topChanged" ? (
        <p className="text-muted-foreground text-sm">
          {t("aiFiles.testQuery.previousRunTop", {
            time,
            changed: comparison.changed,
            total: comparison.total,
          })}
        </p>
      ) : null}
    </section>
  )
}
