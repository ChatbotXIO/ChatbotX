import type { AIFileWithProcessing } from "@chatbotx.io/business"
import type { AIFileChunking } from "@chatbotx.io/database/partials"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useFormatter, useTranslations } from "next-intl"
import { useIsLocked } from "@/features/templates/components/lock-badge"
import { ReindexAIFileDialog } from "./reindex-ai-file-dialog"

const strategyKey = {
  prose: "aiFiles.chunking.strategy.prose",
  tabular: "aiFiles.chunking.strategy.tabular",
  markdown: "aiFiles.chunking.strategy.markdown",
} as const satisfies Record<AIFileChunking["strategy"], string>

export function AIFileChunkingCard({
  file,
  workspaceId,
}: {
  file: AIFileWithProcessing
  workspaceId: string
}) {
  const t = useTranslations()
  const isLocked = useIsLocked(file.id)
  const format = useFormatter()
  const active =
    file.processingRun &&
    ["queued", "processing"].includes(file.processingRun.status) &&
    !file.processingRun.stale

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("aiFiles.chunking.title")}</CardTitle>
        <ReindexAIFileDialog
          disabled={Boolean(active) || isLocked}
          file={file}
          workspaceId={workspaceId}
        />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {file.chunking ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt>{t("aiFiles.chunking.strategyLabel")}</dt>
              <dd>{t(strategyKey[file.chunking.strategy])}</dd>
            </div>
            <div>
              <dt>{t("aiFiles.chunking.version")}</dt>
              <dd>{file.chunking.chunkerVersion}</dd>
            </div>
            <div>
              <dt>{t("aiFiles.chunking.chunkSize")}</dt>
              <dd>{file.chunking.chunkSize}</dd>
            </div>
            <div>
              <dt>{t("aiFiles.chunking.overlapSize")}</dt>
              <dd>{file.chunking.overlapSize}</dd>
            </div>
            <div>
              <dt>{t("aiFiles.chunking.chunkCount")}</dt>
              <dd>{file.chunking.chunkCount}</dd>
            </div>
            <div>
              <dt>{t("aiFiles.chunking.processedAt")}</dt>
              <dd>
                {format.dateTime(new Date(file.chunking.processedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted-foreground">
            {t("aiFiles.detail.noChunkingInfo")}
          </p>
        )}
        <p className="text-muted-foreground">
          {t(
            file.chunkingConfig.isDefault
              ? "aiFiles.chunking.configDefault"
              : "aiFiles.chunking.configCustom",
            {
              chunkSize: file.chunkingConfig.chunkSize,
              overlapSize: file.chunkingConfig.overlapSize,
            },
          )}
        </p>
        {file.indexOutdated ? (
          <p className="text-amber-600 text-sm dark:text-amber-400">
            {t("aiFiles.chunks.indexOutdated")}
          </p>
        ) : null}
        {file.chunkingOutdated ? (
          <p className="text-amber-600 text-sm dark:text-amber-400">
            {t("aiFiles.chunking.outdated")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
