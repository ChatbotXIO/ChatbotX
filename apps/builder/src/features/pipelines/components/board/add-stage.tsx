"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { useIsLocked } from "@/features/templates/components/lock-badge"
import { createStageAction } from "../../actions/stage.action"
import { usePipelineAction } from "../../lib/use-pipeline-action"

export function AddStage({
  workspaceId,
  pipelineId,
}: {
  workspaceId: string
  pipelineId: string
}) {
  const t = useTranslations("pipelines")
  const isLocked = useIsLocked(pipelineId)
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState("")
  const cancel = () => {
    setName("")
    setIsEditing(false)
  }
  const { execute, isPending } = useAction(
    createStageAction.bind(null, workspaceId),
    usePipelineAction({ onDone: cancel }),
  )

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed) {
      execute({ id: pipelineId, name: trimmed })
    }
  }

  if (!isEditing) {
    return (
      <button
        className="flex w-[300px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border bg-muted/20 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        disabled={isLocked}
        onClick={() => setIsEditing(true)}
        type="button"
      >
        <PlusIcon className="size-8" />
        <span className="font-medium text-sm">{t("stage.add")}</span>
      </button>
    )
  }

  return (
    <section
      aria-label={t("stage.add")}
      className="flex w-[300px] shrink-0 flex-col rounded-xl border bg-muted/40"
    >
      <header className="flex items-center gap-1 rounded-t-xl border-b p-2">
        <Input
          aria-label={t("stage.name")}
          autoFocus
          className="h-8"
          disabled={isPending}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              submit()
            }
            if (event.key === "Escape") {
              cancel()
            }
          }}
          placeholder={t("stage.namePlaceholder")}
          value={name}
        />
        {isPending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <Button
            aria-label={t("stage.cancel")}
            className="size-7 shrink-0"
            onClick={cancel}
            size="icon"
            variant="ghost"
          >
            <XIcon />
          </Button>
        )}
      </header>
    </section>
  )
}
