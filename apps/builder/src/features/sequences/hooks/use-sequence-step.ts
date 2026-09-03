import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { deleteSequenceStepAction } from "../actions/delete-sequence-step.action"
import { upsertSequenceStepAction } from "../actions/upsert-sequence-step.action"
import type { DelayChange, DelayUnit } from "../lib/delay"
import { delayViewToStored } from "../lib/delay"

type SavePayload = {
  stepId?: string
  sequenceId: string
  order: number
  delayDays?: number
  delayMinutes?: number
  delayUnit?: DelayUnit
  specificDateTime?: string | null
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
  workspaceId: string
  isFirst?: boolean
  previousStepTime?: Date
  onSaved?: () => void
}

type ChangedFields = {
  flowId?: string
  delay?: DelayChange
  isActive?: boolean
  anytime?: boolean
  sendTimeStart?: string | null
  sendTimeEnd?: string | null
  sendDays?: string[]
}

export function useSequenceStep({
  step,
  stepNumber,
  sequenceId,
  workspaceId,
  isFirst = false,
  previousStepTime,
  onSaved,
}: UseSequenceStepProps) {
  const t = useTranslations()
  const router = useRouter()
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSavesRef = useRef(0)
  // FIFO save queue: a payload built before the CREATE step's response comes
  // back has no stepId. This ref carries that id forward to every queued
  // payload after it so a second save updates the created row instead of
  // creating a duplicate.
  const createdStepIdRef = useRef<string | undefined>(step?.id)

  const [isSaving, setIsSaving] = useState(false)
  const [showFlowError, setShowFlowError] = useState(false)

  const performSave = useCallback(
    async (payload: SavePayload): Promise<boolean> => {
      const isCreate = payload.stepId === undefined
      const resolvedPayload = isCreate
        ? { ...payload, stepId: createdStepIdRef.current }
        : payload

      try {
        const result = await upsertSequenceStepAction(
          workspaceId,
          resolvedPayload,
        )

        if (result?.data) {
          if (isCreate) {
            createdStepIdRef.current = result.data.stepId
          }
          onSaved?.()
          return true
        }

        toast.error(t("messages.unknownError"))
        return false
      } catch (error) {
        console.error("Error saving step:", error)
        toast.error(t("messages.unknownError"))
        return false
      }
    },
    [workspaceId, onSaved, t],
  )

  const handleSave = useCallback(
    (changedFields: ChangedFields): Promise<boolean> => {
      const { delay } = changedFields

      if (delay?.unit === "specificTime" && delay.specificDateTime) {
        const currentStepTime = new Date(delay.specificDateTime)
        const now = new Date()

        if (currentStepTime <= now) {
          toast.error(t("sequences.timeValidation"))
          return Promise.resolve(false)
        }

        if (
          !isFirst &&
          previousStepTime &&
          currentStepTime <= previousStepTime
        ) {
          toast.error(t("sequences.timeValidation"))
          return Promise.resolve(false)
        }
      }

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

      if (delay !== undefined) {
        const specificDateTimeIso =
          delay.unit === "specificTime" && delay.specificDateTime
            ? new Date(delay.specificDateTime).toISOString()
            : null

        const stored = delayViewToStored({
          unit: delay.unit,
          value: delay.value,
          specificDateTimeIso,
        })

        payload.delayDays = stored.delayDays
        payload.delayMinutes = stored.delayMinutes
        payload.delayUnit = stored.delayUnit
        payload.specificDateTime = stored.specificDateTime
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

      pendingSavesRef.current += 1
      setIsSaving(true)

      const savePromise = saveQueueRef.current.then(() => performSave(payload))

      saveQueueRef.current = savePromise.then(() => {
        pendingSavesRef.current -= 1
        if (pendingSavesRef.current === 0) {
          setIsSaving(false)
          router.refresh()
        }
      })

      return savePromise
    },
    [
      step?.id,
      t,
      isFirst,
      previousStepTime,
      sequenceId,
      stepNumber,
      performSave,
      router,
    ],
  )

  const handleDelete = useCallback(async () => {
    if (!step?.id) {
      return
    }

    try {
      const result = await deleteSequenceStepAction(workspaceId, {
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
  }, [step?.id, workspaceId, sequenceId, t, router])

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

export type { Step }
export { WEEKDAY_ORDER }
