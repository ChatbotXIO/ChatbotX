"use client"

import type { AIFileWithProcessing } from "@chatbotx.io/business"
import {
  AI_FILE_CHUNKING_LIMITS,
  type AIFileChunkingConfig,
  type AIFileChunkingConfigStrategy,
  estimateAIFileChunkCount,
  type ResolvedAIFileChunkingConfig,
  resolveAIFileChunkingConfig,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { reindexAIFileAction } from "../actions/reindex-ai-file.action"

const CHUNK_SIZE_PRESETS = [
  { key: "small", value: 500 },
  { key: "medium", value: 1000 },
  { key: "large", value: 2000 },
] as const

const presetLabelKey = {
  small: "aiFiles.reindex.presets.small",
  medium: "aiFiles.reindex.presets.medium",
  large: "aiFiles.reindex.presets.large",
} as const satisfies Record<(typeof CHUNK_SIZE_PRESETS)[number]["key"], string>

const strategyLabelKey = {
  auto: "aiFiles.reindex.strategy.auto",
  prose: "aiFiles.reindex.strategy.prose",
} as const satisfies Record<AIFileChunkingConfigStrategy, string>

type FormState = {
  strategy: AIFileChunkingConfigStrategy
  chunkSize: string
  overlapSize: string
  tabularHeaderRow: string
}

function toFormState(config: ResolvedAIFileChunkingConfig): FormState {
  return {
    strategy: config.strategy,
    chunkSize: String(config.chunkSize),
    overlapSize: String(config.overlapSize),
    tabularHeaderRow: String(config.tabularHeaderRow),
  }
}

/** Parses the form into a clamped config; unparsable numbers fall back to the defaults. */
function resolveForm(form: FormState): ResolvedAIFileChunkingConfig {
  const numberOrUndefined = (value: string) =>
    value.trim() === "" || !Number.isFinite(Number(value))
      ? undefined
      : Math.round(Number(value))
  return resolveAIFileChunkingConfig({
    strategy: form.strategy,
    chunkSize: numberOrUndefined(form.chunkSize),
    overlapSize: numberOrUndefined(form.overlapSize),
    tabularHeaderRow: numberOrUndefined(form.tabularHeaderRow),
  })
}

function sameConfig(
  left: ResolvedAIFileChunkingConfig,
  right: ResolvedAIFileChunkingConfig,
): boolean {
  return (
    left.strategy === right.strategy &&
    left.chunkSize === right.chunkSize &&
    left.overlapSize === right.overlapSize &&
    left.tabularHeaderRow === right.tabularHeaderRow
  )
}

export function ReindexAIFileDialog({
  disabled,
  file,
  onSuccess,
  workspaceId,
}: {
  disabled?: boolean
  file: AIFileWithProcessing
  /** Called after a run was queued (not when one was already running). */
  onSuccess?: () => void
  workspaceId: string
}) {
  const [open, setOpen] = useState(false)
  const current = resolveAIFileChunkingConfig(file.chunkingConfig)
  const [form, setForm] = useState<FormState>(() => toFormState(current))
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { execute, isPending } = useAction(
    reindexAIFileAction.bind(null, workspaceId, file.id),
    {
      onSuccess: async ({ data }) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.aiFilesAPI.getAIFileAuthenticatedAPI.key(),
        })
        toast.success(
          t(
            data?.coalesced
              ? "aiFiles.reindex.alreadyRunning"
              : "aiFiles.reindex.queued",
          ),
        )
        setOpen(false)
        if (!data?.coalesced) {
          onSuccess?.()
        }
        router.refresh()
      },
      onError: ({ error }) =>
        toast.error(error.serverError ?? t("messages.error")),
    },
  )

  const next = resolveForm(form)
  const changed = !sameConfig(next, current)
  const knownStrategy = file.chunking?.strategy
  // Spreadsheets pack whole rows, so overlap only matters for prose/Markdown.
  const isTabular = next.strategy === "auto" && knownStrategy === "tabular"
  const showStrategy = knownStrategy !== "prose" || current.strategy === "prose"
  const showHeaderRow =
    knownStrategy === undefined || knownStrategy === "tabular"
  const extractedChars = file.chunking?.extractedChars
  const estimate =
    extractedChars === undefined
      ? null
      : estimateAIFileChunkCount({
          strategy:
            next.strategy === "prose" ? "prose" : (knownStrategy ?? "prose"),
          extractedChars,
          chunkSize: next.chunkSize,
          overlapSize: isTabular ? 0 : next.overlapSize,
        })

  const submit = () => {
    if (!changed) {
      execute({})
      return
    }
    const defaults = resolveAIFileChunkingConfig(null)
    // Back to the defaults is stored as "no parameters" (null), not as a copy.
    const payload: AIFileChunkingConfig | null = sameConfig(next, defaults)
      ? null
      : next
    execute({ chunkingConfig: payload })
  }

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value)
        if (value) {
          setForm(toFormState(current))
        }
      }}
      open={open}
    >
      {disabled ? (
        // A disabled button swallows pointer events, so the tooltip hangs
        // off a wrapper instead.
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <Button disabled size="sm" variant="outline">
                  {t("aiFiles.reindex.action")}
                </Button>
              </span>
            }
          />
          <TooltipContent>{t("aiFiles.reindex.alreadyRunning")}</TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger
          render={
            <Button
              size="sm"
              variant={file.chunkingOutdated ? "default" : "outline"}
            >
              {t("aiFiles.reindex.action")}
            </Button>
          }
        />
      )}
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("aiFiles.reindex.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("aiFiles.reindex.confirmDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="font-medium">{t("aiFiles.reindex.parameters")}</p>
          {showStrategy ? (
            <fieldset className="space-y-1">
              <legend className="text-muted-foreground">
                {t("aiFiles.reindex.strategyLabel")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {(["auto", "prose"] as const).map((strategy) => (
                  <Button
                    key={strategy}
                    onClick={() => setForm({ ...form, strategy })}
                    size="sm"
                    type="button"
                    variant={form.strategy === strategy ? "default" : "outline"}
                  >
                    {t(strategyLabelKey[strategy])}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <fieldset className="space-y-1">
            <legend className="text-muted-foreground">
              {t("aiFiles.reindex.chunkSize")}
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              {CHUNK_SIZE_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  onClick={() =>
                    setForm({ ...form, chunkSize: String(preset.value) })
                  }
                  size="sm"
                  type="button"
                  variant={
                    next.chunkSize === preset.value ? "default" : "outline"
                  }
                >
                  {t(presetLabelKey[preset.key])} {preset.value}
                </Button>
              ))}
              <Input
                aria-label={t("aiFiles.reindex.presets.custom")}
                className="w-28"
                max={AI_FILE_CHUNKING_LIMITS.chunkSize.max}
                min={AI_FILE_CHUNKING_LIMITS.chunkSize.min}
                onChange={(event) =>
                  setForm({ ...form, chunkSize: event.target.value })
                }
                type="number"
                value={form.chunkSize}
              />
            </div>
          </fieldset>
          <div className="space-y-1">
            <label className="text-muted-foreground" htmlFor="reindex-overlap">
              {t("aiFiles.reindex.overlapSize")}
            </label>
            <Input
              disabled={isTabular}
              id="reindex-overlap"
              max={AI_FILE_CHUNKING_LIMITS.overlapSize.max}
              min={0}
              onChange={(event) =>
                setForm({ ...form, overlapSize: event.target.value })
              }
              type="number"
              value={isTabular ? "0" : form.overlapSize}
            />
            {isTabular ? (
              <p className="text-muted-foreground text-xs">
                {t("aiFiles.reindex.overlapDisabledTabular")}
              </p>
            ) : null}
          </div>
          {showHeaderRow ? (
            <div className="space-y-1">
              <label className="text-muted-foreground" htmlFor="reindex-header">
                {t("aiFiles.reindex.tabularHeaderRow")}
              </label>
              <Input
                id="reindex-header"
                max={AI_FILE_CHUNKING_LIMITS.tabularHeaderRow.max}
                min={AI_FILE_CHUNKING_LIMITS.tabularHeaderRow.min}
                onChange={(event) =>
                  setForm({ ...form, tabularHeaderRow: event.target.value })
                }
                type="number"
                value={form.tabularHeaderRow}
              />
            </div>
          ) : null}
          <Button
            onClick={() =>
              setForm(toFormState(resolveAIFileChunkingConfig(null)))
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("aiFiles.reindex.resetDefaults")}
          </Button>
          {estimate === null ? null : (
            <p>
              {t("aiFiles.reindex.estimate", {
                estimate,
                current: file.chunksCount,
              })}
            </p>
          )}
          {changed ? (
            <div className="space-y-1 text-amber-600 dark:text-amber-400">
              <p>
                {t("aiFiles.reindex.reembedWarning", {
                  count: estimate ?? file.chunksCount,
                })}
              </p>
              <p>{t("aiFiles.reindex.largeChunkWarning")}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {t("aiFiles.reindex.noChangeNote")}
            </p>
          )}
          {file.chunkingOutdated && !changed ? (
            <p className="text-amber-600 dark:text-amber-400">
              {t("aiFiles.reindex.downtimeWarning")}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose
            render={<Button variant="ghost">{t("actions.cancel")}</Button>}
          />
          <Button disabled={isPending} onClick={submit}>
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
