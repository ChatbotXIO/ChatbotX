"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { ChevronDownIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { useDelayState } from "../hooks/use-delay-state"
import { type DelayUnit, useSequenceStep } from "../hooks/use-sequence-step"
import { useTimeRangeState } from "../hooks/use-time-range-state"

import { DelaySelector } from "./delay-selector"
import { DeleteStepDialog } from "./delete-step-dialog"
import { FlowSelectorSimple } from "./flow-selector"
import { TimeRangeSelector } from "./time-range-selector"

type SequenceStepCardProps = {
  step?: {
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
  stepNumber: number
  sequenceId: string
  chatbotId: string
  isFirst?: boolean
  isNew?: boolean
  onSaved?: () => void
  previousStepTime?: Date
}

export function SequenceStepCard({
  step,
  stepNumber,
  sequenceId,
  chatbotId,
  isFirst = false,
  isNew = false,
  onSaved,
  previousStepTime,
}: SequenceStepCardProps) {
  const t = useTranslations()
  const [selectedFlowId, setSelectedFlowId] = useState(step?.flowId || "")
  const [isActive, setIsActive] = useState(step?.isActive ?? false)
  const [isTimeOptionsExpanded, setIsTimeOptionsExpanded] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const {
    isSaving,
    showFlowError,
    handleSave,
    handleDelete,
    handleSelectFlow,
    handleActiveChange,
  } = useSequenceStep({
    step,
    stepNumber,
    sequenceId,
    chatbotId,
    isFirst,
    previousStepTime,
    onSaved,
    currentDelayUnit: (step?.delayUnit as DelayUnit) || "days",
    currentDelayValue: step?.delayDays || step?.delayMinutes || 1,
  })

  const {
    delayUnit,
    delayValue,
    specificDateTime,
    handleDelayUnitChange,
    handleDelayValueChange,
    handleSpecificDateTimeChange,
  } = useDelayState(step, handleSave)

  const {
    timeOption,
    startTime,
    endTime,
    selectedDays,
    handleTimeOptionChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleSelectedDaysChange,
  } = useTimeRangeState(step, handleSave)

  return (
    <div className="grid">
      <div className="mt-2 mb-2 space-y-4 pl-4">
        <Card className="py-2 shadow-none">
          <CardContent>
            {/* Main row */}
            <div className="flex items-center gap-3">
              <div className="flex min-w-[320px] max-w-xl flex-1 items-center gap-2">
                <Switch
                  checked={isActive}
                  className="cursor-pointer"
                  onCheckedChange={(checked) => {
                    if (!selectedFlowId) {
                      handleActiveChange(checked, "")
                      return
                    }

                    setIsActive(checked)
                    handleActiveChange(checked, selectedFlowId)
                  }}
                />

                <span className="mr-4 ml-4 whitespace-nowrap text-muted-foreground text-sm">
                  {t("sequences.sendLabel")}
                </span>

                <FlowSelectorSimple
                  onChange={(flowId) => {
                    setSelectedFlowId(flowId)
                    handleSelectFlow(flowId)
                  }}
                  showError={showFlowError}
                  value={selectedFlowId}
                />
              </div>

              <DelaySelector
                delayUnit={delayUnit}
                delayValue={delayValue}
                isSaving={isSaving}
                onDelayUnitChange={handleDelayUnitChange}
                onDelayValueChange={handleDelayValueChange}
                onSpecificDateTimeChange={handleSpecificDateTimeChange}
                specificDateTime={specificDateTime}
              />

              <div className="ml-auto flex items-center gap-1">
                <Button
                  className="h-8 w-8 hover:bg-muted hover:text-primary"
                  onClick={() =>
                    setIsTimeOptionsExpanded(!isTimeOptionsExpanded)
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform ${
                      isTimeOptionsExpanded ? "rotate-180" : ""
                    }`}
                  />
                </Button>
                {!isNew && step?.id && (
                  <Button
                    className="h-8 w-8 hover:bg-muted hover:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isTimeOptionsExpanded
                  ? "mt-3 max-h-[1000px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <TimeRangeSelector
                endTime={endTime}
                onEndTimeChange={handleEndTimeChange}
                onSelectedDaysChange={handleSelectedDaysChange}
                onStartTimeChange={handleStartTimeChange}
                onTimeOptionChange={handleTimeOptionChange}
                selectedDays={selectedDays}
                startTime={startTime}
                stepId={step?.id}
                timeOption={timeOption}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <DeleteStepDialog
        onConfirm={handleDelete}
        onOpenChange={setShowDeleteDialog}
        open={showDeleteDialog}
      />
    </div>
  )
}
