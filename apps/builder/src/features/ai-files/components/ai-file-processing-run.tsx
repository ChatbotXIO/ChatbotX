import type { AIFileWithProcessing } from "@chatbotx.io/business"
import type { AIFileProcessingRunErrorCode } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useFormatter, useTranslations } from "next-intl"

const statusKey = {
  queued: "aiFiles.processingRun.status.queued",
  processing: "aiFiles.processingRun.status.processing",
  success: "aiFiles.processingRun.status.success",
  error: "aiFiles.processingRun.status.error",
} as const satisfies Record<
  NonNullable<AIFileWithProcessing["processingRun"]>["status"],
  string
>

const errorKey = {
  fileTooLarge: "aiFiles.processingRun.error.fileTooLarge",
  tooManyChunks: "aiFiles.processingRun.error.tooManyChunks",
  fileUnreadable: "aiFiles.processingRun.error.fileUnreadable",
  noExtractableContent: "aiFiles.processingRun.error.noExtractableContent",
  noEmbeddingProvider: "aiFiles.processingRun.error.noEmbeddingProvider",
  enqueueFailed: "aiFiles.processingRun.error.enqueueFailed",
  unknown: "aiFiles.processingRun.error.unknown",
} as const satisfies Record<AIFileProcessingRunErrorCode, string>

export function AIFileProcessingRun({
  processingRun,
}: {
  processingRun: AIFileWithProcessing["processingRun"]
}) {
  const t = useTranslations()
  const format = useFormatter()

  if (!processingRun) {
    return null
  }

  const dateTime = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—"

  return (
    <section
      aria-label={t("aiFiles.processingRun.title")}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">{t("aiFiles.processingRun.title")}</h2>
        <Badge
          variant={
            processingRun.status === "error" ? "destructive" : "secondary"
          }
        >
          {t(statusKey[processingRun.status])}
        </Badge>
        {processingRun.stale ? (
          <Badge variant="outline">{t("aiFiles.processingRun.stale")}</Badge>
        ) : null}
      </div>
      <dl className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
        <div>
          <dt>{t("aiFiles.processingRun.queuedAt")}</dt>
          <dd>{dateTime(processingRun.queuedAt)}</dd>
        </div>
        <div>
          <dt>{t("aiFiles.processingRun.startedAt")}</dt>
          <dd>{dateTime(processingRun.startedAt)}</dd>
        </div>
        <div>
          <dt>{t("aiFiles.processingRun.heartbeatAt")}</dt>
          <dd>{dateTime(processingRun.heartbeatAt)}</dd>
        </div>
        <div>
          <dt>{t("aiFiles.processingRun.finishedAt")}</dt>
          <dd>{dateTime(processingRun.finishedAt)}</dd>
        </div>
      </dl>
      {processingRun.error ? (
        <p className="text-destructive text-sm">
          {t(errorKey[processingRun.error])}
        </p>
      ) : null}
      {processingRun.status === "success" ? (
        <p className="text-muted-foreground text-sm">
          {t("aiFiles.processingRun.successNote")}
        </p>
      ) : null}
    </section>
  )
}
