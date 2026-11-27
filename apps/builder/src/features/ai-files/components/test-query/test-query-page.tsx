"use client"

import type { AIFileWithProcessing } from "@chatbotx.io/business"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useQueryStates } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { searchAIFilesAction } from "../../actions/search-ai-files.action"
import {
  buildSnapshotKey,
  compareSnapshots,
  readSnapshot,
  snapshotFromResult,
  type TestQueryComparison,
  writeSnapshot,
} from "../../lib/test-query-history"
import type { searchAIFilesResponse } from "../../schema/public"
import {
  TEST_QUERY_DEFAULT_LIMIT,
  TEST_QUERY_MAX_EXPECTED,
  TEST_QUERY_MAX_FILES,
  TEST_QUERY_MAX_QUESTION,
  testQuerySearchParsers,
} from "../../schema/test-query-search-params"
import { SearchResultList } from "../search-result-list"
import { FileSummaryTable } from "./file-summary-table"
import { TestQueryForm, type TestQueryFormValues } from "./test-query-form"
import { TestQueryVerdict } from "./test-query-verdict"

type SearchResponse = z.output<typeof searchAIFilesResponse>

type Run = {
  result: SearchResponse
  expected: string
  comparison: TestQueryComparison | null
}

export function TestQueryPage({
  files,
  workspaceId,
}: {
  files: AIFileWithProcessing[]
  workspaceId: string
}) {
  const t = useTranslations()
  const [params, setParams] = useQueryStates(testQuerySearchParsers)
  const knownFileIds = new Set(files.map((file) => file.id))
  // Ids from a shared link may belong to another workspace or a deleted file.
  const initialFileIds = params.fileIds
    .filter((id) => knownFileIds.has(id))
    .slice(0, TEST_QUERY_MAX_FILES)
  const [values, setValues] = useState<TestQueryFormValues>({
    fileIds: initialFileIds,
    question: params.q.slice(0, TEST_QUERY_MAX_QUESTION),
    expected: params.expected.slice(0, TEST_QUERY_MAX_EXPECTED),
    limit: String(params.limit),
  })
  const [run, setRun] = useState<Run | null>(null)

  const search = useAction(searchAIFilesAction.bind(null, workspaceId), {
    onSuccess: ({ data, input }) => {
      if (!data) {
        return
      }
      const key = buildSnapshotKey(input.fileIds ?? [], input.query)
      const snapshot = snapshotFromResult(data, new Date().toISOString())
      const previous = readSnapshot(key)
      writeSnapshot(key, snapshot)
      setRun({
        result: data,
        expected: input.expectedText ?? "",
        comparison: previous ? compareSnapshots(previous, snapshot) : null,
      })
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("messages.error")),
  })

  const submit = () => {
    const parsedLimit = Number(values.limit)
    const limit =
      values.limit !== "" && Number.isInteger(parsedLimit)
        ? parsedLimit
        : TEST_QUERY_DEFAULT_LIMIT
    setParams({
      fileIds: values.fileIds,
      q: values.question,
      expected: values.expected === "" ? null : values.expected,
      limit,
    })
    search.execute({
      fileIds: values.fileIds,
      query: values.question,
      ...(values.expected.trim() ? { expectedText: values.expected } : {}),
      limit,
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <TestQueryForm
        files={files}
        onChange={setValues}
        onSubmit={submit}
        pending={search.isPending}
        values={values}
      />
      <div className="min-w-0 space-y-4">
        {run ? (
          <>
            <TestQueryVerdict comparison={run.comparison} result={run.result} />
            <FileSummaryTable
              files={files}
              result={run.result}
              workspaceId={workspaceId}
            />
            <SearchResultList
              expectedText={run.expected}
              result={run.result}
              workspaceId={workspaceId}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("aiFiles.testQuery.description")}
          </p>
        )}
      </div>
    </div>
  )
}
