"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { updateContactLifecycleAction } from "./actions/update-contact-lifecycle-action"

type ContactLifecycleSelectProps = {
  contactId: string
  currentStageId: string | null
  stages: LifecycleStageModel[]
  disabled?: boolean
  onChange?: (stageId: string | null) => void
}

export function ContactLifecycleSelect({
  contactId,
  currentStageId,
  stages,
  disabled = false,
  onChange,
}: ContactLifecycleSelectProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [optimisticStageId, setOptimisticStageId] = useState<string | null>(
    currentStageId,
  )

  const activeStages = stages.filter((s) => !s.isLost)
  const lostStages = stages.filter((s) => s.isLost)

  const { execute, isExecuting } = useAction(
    updateContactLifecycleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("lifecycle.contactUpdated"))
      },
      onError: ({ error }) => {
        // rollback
        setOptimisticStageId(currentStageId)
        toast.error(error.serverError ?? t("lifecycle.contactUpdateError"))
      },
    },
  )

  function handleChange(value: string) {
    const next = value === "__none__" ? null : value
    setOptimisticStageId(next)
    onChange?.(next)
    execute({ contactId, lifecycleStageId: next })
  }

  return (
    <Select
      disabled={disabled || isExecuting}
      onValueChange={handleChange}
      value={optimisticStageId ?? "__none__"}
    >
      <SelectTrigger className="h-8 w-full">
        <SelectValue placeholder={t("lifecycle.selectPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground">
            {t("lifecycle.noStage")}
          </span>
        </SelectItem>
        {activeStages.length > 0 &&
          activeStages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              <span className="mr-2">{stage.icon ?? "•"}</span>
              {stage.name}
            </SelectItem>
          ))}
        {lostStages.length > 0 &&
          lostStages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              <span className="mr-2">{stage.icon ?? "•"}</span>
              {stage.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}
