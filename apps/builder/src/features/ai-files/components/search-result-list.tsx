"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Fragment, useState } from "react"
import type { z } from "zod"
import { splitByExpected } from "../lib/expected-highlight"
import type { searchAIFilesResponse } from "../schema/public"

type SearchResponse = z.output<typeof searchAIFilesResponse>

const diagnosisKey = {
  ok: "aiFiles.testQuery.diagnosis.ok",
  noReadyChunks: "aiFiles.testQuery.diagnosis.noReadyChunks",
  allBelowThreshold: "aiFiles.testQuery.diagnosis.allBelowThreshold",
  noMatches: "aiFiles.testQuery.diagnosis.noMatches",
  agentHasNoFiles: "aiFiles.testQuery.diagnosis.agentHasNoFiles",
} as const satisfies Record<SearchResponse["diagnosis"], string>

export function SearchResultList({
  expectedText,
  result,
  workspaceId,
}: {
  expectedText?: string
  result: SearchResponse | undefined
  workspaceId: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const t = useTranslations()
  if (!result) {
    return null
  }

  return (
    <section aria-live="polite" className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {t(diagnosisKey[result.diagnosis])}
      </p>
      {result.appliedConfig ? (
        <div className="rounded-md border p-3 text-muted-foreground text-sm">
          <p className="font-medium text-foreground">
            {t("aiFiles.testQuery.appliedConfig")}
          </p>
          <p>
            {result.appliedConfig.modelId} · {result.appliedConfig.provider}
          </p>
          <p>
            {t("aiFiles.testQuery.agentDefaultThreshold")}:{" "}
            {result.appliedConfig.agentDefaultThreshold}
          </p>
          <p>
            {t("aiFiles.testQuery.limit")}: {result.appliedConfig.limit}
          </p>
          <p>
            {t("aiFiles.testQuery.timings")}:{" "}
            {result.timingsMs.embed + result.timingsMs.search}ms
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        {result.results.map((item, index) => {
          const open = expanded.has(item.chunkId)
          // Results are sorted by similarity, so the threshold falls between
          // the last passing chunk and the first failing one.
          const crossesThreshold =
            !item.passedThreshold &&
            (index === 0 || result.results[index - 1]?.passedThreshold)
          return (
            <Fragment key={item.chunkId}>
              {crossesThreshold && result.appliedConfig ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="h-px flex-1 bg-border" />
                  {t("aiFiles.testQuery.thresholdLine", {
                    threshold: result.appliedConfig.similarityThreshold,
                  })}
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <article
                className={
                  item.passedThreshold
                    ? "rounded-md border p-3"
                    : "rounded-md border border-dashed p-3 opacity-65"
                }
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {t("aiFiles.testQuery.rank", { rank: item.rank })}
                  </span>
                  <Link
                    className="font-medium underline"
                    href={`/space/${workspaceId}/ai-files/${item.fileId}`}
                  >
                    {item.fileName}
                  </Link>
                  <span className="text-muted-foreground">
                    {item.chunkIndex === null
                      ? t("aiFiles.testQuery.chunkUnnumbered")
                      : t("aiFiles.testQuery.chunkNumber", {
                          index: item.chunkIndex,
                        })}
                  </span>
                  <Badge variant="secondary">
                    {item.similarity.toFixed(3)}
                  </Badge>
                  {item.agentVisible ? (
                    <Badge>{t("aiFiles.testQuery.aiWillSee")}</Badge>
                  ) : null}
                  {expectedText &&
                  splitByExpected(item.content, expectedText).some(
                    (part) => part.match,
                  ) ? (
                    <Badge variant="outline">
                      {t("aiFiles.testQuery.containsExpected")}
                    </Badge>
                  ) : null}
                  {item.passedThreshold ? null : (
                    <Badge variant="outline">
                      {t("aiFiles.testQuery.belowThreshold")}
                    </Badge>
                  )}
                </div>
                <p
                  className={
                    open
                      ? "mt-2 whitespace-pre-wrap text-sm"
                      : "mt-2 line-clamp-3 whitespace-pre-wrap text-sm"
                  }
                >
                  {splitByExpected(item.content, expectedText).map(
                    (part, partIndex) =>
                      part.match ? (
                        <mark
                          className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-600/50"
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional slices of one string
                          key={partIndex}
                        >
                          {part.text}
                        </mark>
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional slices of one string
                        <span key={partIndex}>{part.text}</span>
                      ),
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current)
                        if (next.has(item.chunkId)) {
                          next.delete(item.chunkId)
                        } else {
                          next.add(item.chunkId)
                        }
                        return next
                      })
                    }
                    size="sm"
                    variant="ghost"
                  >
                    {t(open ? "actions.collapse" : "actions.expand")}
                  </Button>
                </div>
              </article>
            </Fragment>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("aiFiles.testQuery.scoreNotComparable")}
      </p>
    </section>
  )
}
