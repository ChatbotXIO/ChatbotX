"use client"

import type { ExternalRequestStepSchema } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { useJsonSourceContext } from "./json-source-context"

export const TestNowPanel = () => {
  const t = useTranslations()
  const { getValues } = useFormContext<ExternalRequestStepSchema>()
  const { execute, isPending, testResult } = useJsonSourceContext()

  const handleTestNow = () => {
    const { method, url, headers, body } = getValues()
    execute({ method, url, headers, body })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={isPending}
        onClick={handleTestNow}
        size="sm"
        type="button"
        variant="outline"
      >
        {isPending ? (
          <Loader2Icon className="mr-2 size-4 animate-spin" />
        ) : (
          <PlayIcon className="mr-2 size-4" />
        )}
        {t("actions.testNow")}
      </Button>

      {testResult && (
        <div className="flex flex-col gap-1 rounded-md border bg-muted/50 p-3 text-xs">
          <div className="flex gap-2 font-medium">
            <span>
              {t("fields.statusCode.label")}: {testResult.statusCode}
            </span>
            <span>{testResult.durationMs}ms</span>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {testResult.responseBody}
          </pre>
        </div>
      )}
    </div>
  )
}
