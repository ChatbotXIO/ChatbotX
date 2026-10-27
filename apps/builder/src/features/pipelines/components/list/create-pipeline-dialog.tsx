"use client"

import {
  PIPELINE_LIMITS,
  type PipelineType,
  pipelineTypes,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  CircleAlertIcon,
  Columns3Icon,
  HandshakeIcon,
  Loader2Icon,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { createPipelineAction } from "../../actions/pipeline.action"
import { pipelineTypeKeys } from "../../lib/item-noun"
import { useInvalidatePipelines } from "../../lib/use-invalidate-pipelines"

const PIPELINE_TYPE_ICONS = {
  opportunity: HandshakeIcon,
  ticket: CircleAlertIcon,
  custom: Columns3Icon,
} as const satisfies Record<PipelineType, LucideIcon>

/**
 * Pick a type first (nothing is preselected, so a board never silently gets a
 * type the user did not choose); the name field then appears, prefilled with
 * the type's name (the server suffixes a taken name).
 */
export function CreatePipelineDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("pipelines")
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        {/* Mounted per opening, so the dialog always starts with no type picked. */}
        <CreatePipelineForm
          onCreated={() => onOpenChange(false)}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}

export function CreatePipelineForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string
  onCreated: () => void
}) {
  const t = useTranslations("pipelines")
  const router = useRouter()
  const invalidate = useInvalidatePipelines()
  const [type, setType] = useState<PipelineType | null>(null)
  const [name, setName] = useState("")

  const { execute, isPending } = useAction(
    createPipelineAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        invalidate()
        toast.success(t("create.success"))
        onCreated()
        if (data) {
          router.push(`/space/${workspaceId}/pipelines/${data.id}`)
        }
      },
      onError: toastActionError(t("saveFailed")),
    },
  )

  const typeLabel = (option: PipelineType) => t(pipelineTypeKeys[option].label)

  const selectType = (next: PipelineType) => {
    // Follow the type while the name is still a type's default; keep a typed name.
    const isDefaultName =
      name.trim() === "" || (type !== null && name === typeLabel(type))
    setType(next)
    if (isDefaultName) {
      setName(typeLabel(next))
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (type && name.trim()) {
          execute({ type, name: name.trim() })
        }
      }}
    >
      <fieldset className="grid gap-2" disabled={isPending}>
        <legend className="sr-only">{t("create.type")}</legend>
        {pipelineTypes.options.map((option) => {
          const Icon = PIPELINE_TYPE_ICONS[option]
          return (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2"
              key={option}
            >
              <input
                checked={type === option}
                className="sr-only"
                name="pipeline-type"
                onChange={() => selectType(option)}
                type="radio"
                value={option}
              />
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <span className="grid gap-0.5">
                <span className="font-medium text-sm">{typeLabel(option)}</span>
                <span className="text-muted-foreground text-xs">
                  {t(pipelineTypeKeys[option].description)}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {type ? (
        <>
          <label className="grid gap-1.5 text-sm" htmlFor="pipeline-name">
            {t("create.name")}
            <Input
              id="pipeline-name"
              maxLength={PIPELINE_LIMITS.name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("create.namePlaceholder")}
              value={name}
            />
          </label>
          <DialogFooter>
            <Button disabled={isPending || name.trim() === ""} type="submit">
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {t("create.submit")}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </form>
  )
}
