"use client"

import type { AIFileWithProcessing } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon, DownloadIcon, EyeIcon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import prettyBytes from "pretty-bytes"
import { AIFileProcessingStatus } from "@/features/ai-files/ai-file-processing-status"
import { orpc } from "@/lib/orpc/query"
import { AIFileChunkingCard } from "./ai-file-chunking-card"
import { AIFileProcessingRun } from "./ai-file-processing-run"

const POLL_INTERVAL_MS = 5000

/** Poll only while something can still change: an active run or embedding. */
function shouldPoll(file: AIFileWithProcessing | undefined): boolean {
  if (!file) {
    return false
  }
  const run = file.processingRun
  const runActive =
    run !== null &&
    (run.status === "queued" || run.status === "processing") &&
    !run.stale
  return runActive || file.processingStatus === "processing"
}

export function AIFileDetail(props: { workspaceId: string; aiFileId: string }) {
  const t = useTranslations()
  const format = useFormatter()
  const query = useQuery(
    orpc.aiFilesAPI.getAIFileAuthenticatedAPI.queryOptions({
      input: { workspaceId: props.workspaceId, id: props.aiFileId },
      refetchInterval: (current) =>
        shouldPoll(current.state.data) ? POLL_INTERVAL_MS : false,
    }),
  )
  const file = query.data
  if (!file) {
    return null
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          nativeButton={false}
          render={<Link href={`/space/${props.workspaceId}/ai-files`} />}
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon className="me-2 h-4 w-4" />
          {t("actions.back")}
        </Button>
      </div>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="break-all">{file.name}</CardTitle>
          <div className="flex gap-2">
            <Button
              nativeButton={false}
              render={<Link href={file.url} rel="noopener" target="_blank" />}
              size="sm"
              variant="outline"
            >
              <EyeIcon className="me-2 h-4 w-4" />
              {t("actions.view")}
            </Button>
            <Button
              nativeButton={false}
              render={<Link href={file.url} rel="noopener" target="_blank" />}
              size="sm"
              variant="outline"
            >
              <DownloadIcon className="me-2 h-4 w-4" />
              {t("actions.download")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">
                {t("fields.type.label")}
              </dt>
              <dd className="break-all">{file.mimeType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("fields.size.label")}
              </dt>
              <dd>{prettyBytes(file.size)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("fields.createdAt.label")}
              </dt>
              <dd>
                {format.dateTime(new Date(file.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("fields.status.label")}
              </dt>
              <dd>
                <AIFileProcessingStatus
                  aiFileId={file.id}
                  chunksCount={file.chunksCount}
                  processingStatus={file.processingStatus}
                />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          {file.processingRun ? (
            <AIFileProcessingRun processingRun={file.processingRun} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("aiFiles.processingRun.noRun")}
            </p>
          )}
        </CardContent>
      </Card>
      <AIFileChunkingCard file={file} workspaceId={props.workspaceId} />
      <Card>
        <CardHeader>
          <CardTitle>{t("aiFiles.testQuery.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {t("aiFiles.testQuery.description")}
          </p>
          <Button
            render={
              <Link
                href={`/space/${props.workspaceId}/ai-files/test-query?fileIds=${file.id}`}
              />
            }
            size="sm"
            variant="outline"
          >
            <SearchIcon className="me-2 h-4 w-4" />
            {t("aiFiles.testQuery.open")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
