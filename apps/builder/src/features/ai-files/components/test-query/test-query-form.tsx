"use client"

import type { AIFileWithProcessing } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { AIFileProcessingStatus } from "@/features/ai-files/ai-file-processing-status"
import {
  TEST_QUERY_MAX_EXPECTED,
  TEST_QUERY_MAX_FILES,
  TEST_QUERY_MAX_QUESTION,
} from "../../schema/test-query-search-params"

export type TestQueryFormValues = {
  fileIds: string[]
  question: string
  expected: string
  limit: string
}

/** A file can be searched once at least one chunk exists and embedding began. */
function isFileSearchable(file: AIFileWithProcessing): boolean {
  return file.chunksCount > 0 && file.processingStatus !== "pending"
}

export function TestQueryForm({
  files,
  onChange,
  onSubmit,
  pending,
  values,
}: {
  files: AIFileWithProcessing[]
  onChange: (values: TestQueryFormValues) => void
  onSubmit: () => void
  pending: boolean
  values: TestQueryFormValues
}) {
  const t = useTranslations()
  const [filter, setFilter] = useState("")
  const visibleFiles = files.filter((file) =>
    file.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )
  const canSubmit =
    values.question.trim() !== "" && values.fileIds.length > 0 && !pending

  const toggleFile = (fileId: string, checked: boolean) => {
    if (checked) {
      if (
        values.fileIds.length >= TEST_QUERY_MAX_FILES ||
        values.fileIds.includes(fileId)
      ) {
        return
      }
      onChange({ ...values, fileIds: [...values.fileIds, fileId] })
      return
    }
    onChange({
      ...values,
      fileIds: values.fileIds.filter((id) => id !== fileId),
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) {
          onSubmit()
        }
      }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">
            {t("aiFiles.testQuery.files")}{" "}
            <span className="text-muted-foreground">
              {t("aiFiles.testQuery.selectedCount", {
                count: values.fileIds.length,
                max: TEST_QUERY_MAX_FILES,
              })}
            </span>
          </p>
          <Button
            onClick={() =>
              onChange({
                ...values,
                fileIds: files
                  .filter(isFileSearchable)
                  .slice(0, TEST_QUERY_MAX_FILES)
                  .map((file) => file.id),
              })
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("aiFiles.testQuery.selectAllReady")}
          </Button>
        </div>
        <Input
          aria-label={t("aiFiles.testQuery.filterFiles")}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("aiFiles.testQuery.filterFiles")}
          value={filter}
        />
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
          {visibleFiles.map((file) => {
            const searchable = isFileSearchable(file)
            const checked = values.fileIds.includes(file.id)
            const row = (
              <div className="flex items-center gap-2 text-sm" key={file.id}>
                <Checkbox
                  checked={checked}
                  disabled={
                    !searchable ||
                    (!checked && values.fileIds.length >= TEST_QUERY_MAX_FILES)
                  }
                  id={`test-query-file-${file.id}`}
                  onCheckedChange={(next) => toggleFile(file.id, next === true)}
                />
                <label
                  className={`min-w-0 flex-1 truncate ${searchable ? "" : "text-muted-foreground"}`}
                  htmlFor={`test-query-file-${file.id}`}
                >
                  {file.name}
                </label>
                <AIFileProcessingStatus
                  aiFileId={file.id}
                  chunksCount={file.chunksCount}
                  processingStatus={file.processingStatus}
                />
              </div>
            )
            return searchable ? (
              row
            ) : (
              <Tooltip key={file.id}>
                <TooltipTrigger render={row} />
                <TooltipContent>
                  {t("aiFiles.testQuery.fileNotReady")}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
      <div className="space-y-1">
        <label className="font-medium text-sm" htmlFor="test-query-question">
          {t("aiFiles.testQuery.question")}
        </label>
        <Input
          id="test-query-question"
          maxLength={TEST_QUERY_MAX_QUESTION}
          onChange={(event) =>
            onChange({ ...values, question: event.target.value })
          }
          value={values.question}
        />
        <p className="text-muted-foreground text-xs">
          {values.question.length}/{TEST_QUERY_MAX_QUESTION}
        </p>
      </div>
      <div className="space-y-1">
        <label className="font-medium text-sm" htmlFor="test-query-expected">
          {t("aiFiles.testQuery.expected")}
        </label>
        <Input
          id="test-query-expected"
          maxLength={TEST_QUERY_MAX_EXPECTED}
          onChange={(event) =>
            onChange({ ...values, expected: event.target.value })
          }
          value={values.expected}
        />
        <p className="text-muted-foreground text-xs">
          {t("aiFiles.testQuery.expectedHelp")}
        </p>
      </div>
      <div className="space-y-1">
        <label className="font-medium text-sm" htmlFor="test-query-limit">
          {t("aiFiles.testQuery.limit")}
        </label>
        <Input
          id="test-query-limit"
          max="20"
          min="1"
          onChange={(event) =>
            onChange({ ...values, limit: event.target.value })
          }
          step="1"
          type="number"
          value={values.limit}
        />
      </div>
      <Button disabled={!canSubmit} type="submit">
        {t("aiFiles.testQuery.run")}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t("aiFiles.testQuery.simulationNote")}
      </p>
    </form>
  )
}
