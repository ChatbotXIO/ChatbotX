import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { deleteSequenceStepAction } from "../actions/delete-sequence-step.action"
import { upsertSequenceStepAction } from "../actions/upsert-sequence-step.action"

type DelayUnit = "immediate" | "minutes" | "hours" | "days" | "specificTime"

type SavePayload = {
  stepId?: string
  sequenceId: string
  order: number
  delayDays?: number
  delayMinutes?: number
  delayUnit?: DelayUnit
  specificDateTime?: string
  flowId?: string
  isActive?: boolean
  anytime?: boolean
  sendTimeStart?: string | null
  sendTimeEnd?: string | null
  sendDays?: string[]
}

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

type Step = {
  id: string
  order: number
  delayDays: number
  delayMinutes: number
  delayUnit?: string | null
  specificDateTime?: Date | null
  flowId: string | null
  flow: { id: string; name: string } | null
  isActive?: boolean
  anytime?: boolean
  sendTimeStart?: string | null
  sendTimeEnd?: string | null
  sendDays?: string | null
}

type UseSequenceStepProps = {
  step?: Step
  stepNumber: number
  sequenceId: string
  chatbotId: string
  isFirst?: boolean
  previousStepTime?: Date
  onSaved?: () => void
  currentDelayUnit: DelayUnit
  currentDelayValue: number
}

export function useSequenceStep({
  step,
  stepNumber,
  sequenceId,
  chatbotId,
  isFirst = false,
  previousStepTime,
  onSaved,
  currentDelayUnit,
  currentDelayValue,
}: UseSequenceStepProps) {
  const t = useTranslations()
  const router = useRouter()
  const isSavingRef = useRef(false)

  const [isSaving, setIsSaving] = useState(false)
  const [showFlowError, setShowFlowError] = useState(false)

  const handleSave = useCallback(
    async (changedFields: {
      flowId?: string
      delayUnit?: DelayUnit
      delayValue?: number
      specificDateTime?: string
      isActive?: boolean
      anytime?: boolean
      sendTimeStart?: string | null
      sendTimeEnd?: string | null
      sendDays?: string[]
    }) => {
      if (isSavingRef.current) {
        return
      }

      if (
        changedFields.delayUnit === "specificTime" &&
        changedFields.specificDateTime
      ) {
        const currentStepTime = new Date(changedFields.specificDateTime)
        const now = new Date()

        if (currentStepTime <= now) {
          toast.error(t("sequences.timeValidation"))
          return
        }

        if (
          !isFirst &&
          previousStepTime &&
          currentStepTime <= previousStepTime
        ) {
          toast.error(t("sequences.timeValidation"))
          return
        }
      }

      isSavingRef.current = true
      setIsSaving(true)

      try {
        const payload: SavePayload = {
          stepId: step?.id,
          sequenceId,
          order: stepNumber - 1,
        }

        if (changedFields.flowId !== undefined) {
          payload.flowId = changedFields.flowId
        }

        if (changedFields.isActive !== undefined) {
          payload.isActive = changedFields.isActive
        }

        if (
          changedFields.delayUnit !== undefined ||
          changedFields.delayValue !== undefined
        ) {
          const unit = changedFields.delayUnit ?? currentDelayUnit
          const value = changedFields.delayValue ?? currentDelayValue
          let delayDays = 0
          let delayMinutes = 0

          if (unit === "days") {
            delayDays = value
          } else if (unit === "hours") {
            delayMinutes = value * 60
          } else if (unit === "minutes") {
            delayMinutes = value
          }

          payload.delayDays = delayDays
          payload.delayMinutes = delayMinutes
          payload.delayUnit = unit
        }

        if (changedFields.specificDateTime !== undefined) {
          const localDate = new Date(changedFields.specificDateTime)
          payload.specificDateTime = localDate.toISOString()
          payload.delayDays = 0
          payload.delayMinutes = 0
          payload.delayUnit = "specificTime"
        }

        if (changedFields.anytime !== undefined) {
          payload.anytime = changedFields.anytime
        }

        if (changedFields.sendTimeStart !== undefined) {
          payload.sendTimeStart = changedFields.sendTimeStart
        }

        if (changedFields.sendTimeEnd !== undefined) {
          payload.sendTimeEnd = changedFields.sendTimeEnd
        }

        if (changedFields.sendDays !== undefined) {
          payload.sendDays = changedFields.sendDays
        }

        const result = await upsertSequenceStepAction(chatbotId, payload)

        if (result?.data) {
          onSaved?.()
          router.refresh()
        } else {
          toast.error(t("messages.unknownError"))
        }
      } catch (error) {
        console.error("Error saving step:", error)
        toast.error(t("messages.unknownError"))
      } finally {
        setIsSaving(false)
        isSavingRef.current = false
      }
    },
    [
      step?.id,
      t,
      isFirst,
      previousStepTime,
      chatbotId,
      sequenceId,
      stepNumber,
      onSaved,
      router,
      currentDelayUnit,
      currentDelayValue,
    ],
  )

  const handleDelete = useCallback(async () => {
    if (!step?.id) {
      return
    }

    try {
      const result = await deleteSequenceStepAction(chatbotId, {
        stepId: step.id,
        sequenceId,
      })

      if (result?.data) {
        toast.success(
          t("messages.deletedSuccess", { feature: t("sequences.step") }),
        )
        router.refresh()
      } else {
        toast.error(t("messages.deleteFailed"))
      }
    } catch (error) {
      console.error("Error deleting step:", error)
      toast.error(t("messages.deleteFailed"))
    }
  }, [step?.id, chatbotId, sequenceId, t, router])

  const handleSelectFlow = useCallback(
    async (flowId: string) => {
      setShowFlowError(false)
      await handleSave({ flowId })
    },
    [handleSave],
  )

  const handleActiveChange = useCallback(
    async (checked: boolean, selectedFlowId: string) => {
      if (checked && !selectedFlowId) {
        toast.error(t("sequences.selectFlowFirst"))
        setShowFlowError(true)
        setTimeout(() => setShowFlowError(false), 3000)
        return
      }
      setShowFlowError(false)

      if (!step?.id) {
        return
      }
      await handleSave({ isActive: checked })
    },
    [step?.id, t, handleSave],
  )

  return {
    isSaving,
    showFlowError,
    handleSave,
    handleDelete,
    handleSelectFlow,
    handleActiveChange,
  }
}

export type { DelayUnit, Step }
export { WEEKDAY_ORDER }
