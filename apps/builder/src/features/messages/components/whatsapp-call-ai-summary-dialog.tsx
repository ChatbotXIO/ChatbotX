"use client"

import type { AIProvider } from "@chatbotx.io/ai"
import type { CallSummaryResult } from "@chatbotx.io/ai/server"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { generateCallAiSummaryAction } from "../actions/generate-call-ai-summary.action"
import { listCallSummaryProvidersAction } from "../actions/list-call-summary-providers.action"

const LAST_PROVIDER_STORAGE_KEY = "whatsapp-call-summary-provider"

type WhatsappCallAiSummaryDialogProps = {
  whatsappCallId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Empty transcripts disable the Generate button rather than hiding it. */
  hasTranscript: boolean
  onGenerated: (result: CallSummaryResult) => void
}

const readLastProvider = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_PROVIDER_STORAGE_KEY)
  } catch {
    return null
  }
}

const writeLastProvider = (provider: string): void => {
  try {
    window.localStorage.setItem(LAST_PROVIDER_STORAGE_KEY, provider)
  } catch {
    // Best-effort only — a private/blocked storage context just loses the
    // "remember my last choice" convenience, never breaks generation.
  }
}

/**
 * Provider-picker dialog for the on-demand AI Summary,
 * opened from the Call Information sheet's "Generate summary"/"Regenerate"
 * buttons. Lists the workspace's connected AI integrations
 * (`listCallSummaryProvidersAction`); an empty list renders "Connect an AI
 * provider" (not an error).
 */
export const WhatsappCallAiSummaryDialog = ({
  whatsappCallId,
  open,
  onOpenChange,
  hasTranscript,
  onGenerated,
}: WhatsappCallAiSummaryDialogProps) => {
  const t = useTranslations("whatsapp.calls.summaryDialog")
  const workspaceId = useWorkspaceId()
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(
    null,
  )

  const providersQuery = useQuery({
    queryKey: ["whatsapp-call-summary-providers", workspaceId],
    queryFn: async () => {
      const result = await listCallSummaryProvidersAction(workspaceId)
      return result?.data?.providers ?? []
    },
    enabled: open,
  })

  const providers = providersQuery.data ?? []

  useEffect(() => {
    if (!open || providers.length === 0) {
      return
    }
    const lastProvider = readLastProvider()
    const matchedLastProvider = providers.find(
      (option) => option.provider === lastProvider,
    )
    setSelectedProvider((matchedLastProvider ?? providers[0]).provider)
  }, [open, providers])

  const { execute, isPending, result } = useAction(
    generateCallAiSummaryAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data?.aiSummary) {
          writeLastProvider(selectedProvider ?? "")
          onGenerated(data.aiSummary)
          onOpenChange(false)
        }
      },
    },
  )

  const handleGenerate = () => {
    if (!selectedProvider) {
      return
    }
    execute({ whatsappCallId, provider: selectedProvider })
  }

  const generateDisabled = !(hasTranscript && selectedProvider) || isPending
  const buttonLabel = result?.serverError
    ? t("retry")
    : t(isPending ? "generating" : "generate")

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {providersQuery.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!providersQuery.isLoading && providers.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center text-sm">
            <SparklesIcon
              aria-hidden
              className="size-6 text-muted-foreground"
            />
            <p className="font-medium">{t("noProviderTitle")}</p>
            <p className="text-muted-foreground">
              {t("noProviderDescription")}
            </p>
            <Link
              className={buttonVariants({ size: "sm", variant: "secondary" })}
              href={`/space/${workspaceId}/settings/integrations`}
            >
              {t("connectLink")}
            </Link>
          </div>
        )}

        {providers.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t("title")}</legend>
            {providers.map((option) => (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm has-checked:border-primary has-checked:bg-accent"
                key={option.id}
              >
                <input
                  checked={selectedProvider === option.provider}
                  className="size-4"
                  name="ai-summary-provider"
                  onChange={() => setSelectedProvider(option.provider)}
                  type="radio"
                  value={option.provider}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        )}

        {result?.serverError && (
          <p className="text-destructive text-sm">{t("generateFailed")}</p>
        )}

        <DialogFooter>
          {providers.length > 0 &&
            (generateDisabled && !isPending && !hasTranscript ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex">
                      <Button disabled type="button">
                        {t("generate")}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>{t("emptyTranscriptTooltip")}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                disabled={generateDisabled}
                onClick={handleGenerate}
                type="button"
              >
                {isPending && (
                  <Loader2Icon
                    aria-hidden
                    className="me-2 size-4 animate-spin"
                  />
                )}
                {buttonLabel}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
