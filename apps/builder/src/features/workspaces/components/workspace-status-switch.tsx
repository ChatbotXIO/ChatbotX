"use client"

import { isWorkspaceScheduledForDeletion } from "@chatbotx.io/business/workspace-lifecycle/predicates"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { updateWorkspaceStatusAction } from "../actions/update-workspace-status-action"
import { WorkspaceScheduleDialog } from "./workspace-schedule-dialog"

type Schedule = { startTime: string | null; endTime: string | null }

export function WorkspaceStatusSwitch({
  canManageStatus,
  workspace,
}: {
  canManageStatus: boolean
  workspace: {
    id: string
    isActive: boolean
    startTime: string | null
    endTime: string | null
    scheduledDeletionAt?: Date | string | null
  }
}) {
  const t = useTranslations()
  const router = useRouter()
  const scheduledForDeletion = isWorkspaceScheduledForDeletion(workspace)
  const [isActive, setIsActive] = useState(workspace.isActive)
  const [schedule, setSchedule] = useState<Schedule>({
    startTime: workspace.startTime,
    endTime: workspace.endTime,
  })
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)

  useEffect(() => {
    setIsActive(workspace.isActive)
  }, [workspace.isActive])

  useEffect(() => {
    setSchedule({ startTime: workspace.startTime, endTime: workspace.endTime })
  }, [workspace.startTime, workspace.endTime])

  const handleCheckedChange = async (checked: boolean) => {
    if (checked) {
      setShowScheduleDialog(true)
      return
    }

    try {
      const result = await updateWorkspaceStatusAction(workspace.id, {
        isActive: false,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      })
      if (result?.serverError || result?.validationErrors) {
        toast.error(result.serverError ?? t("messages.unknownError"))
        return
      }
      setIsActive(false)
      toast.success(t("workspace.schedule.deactivated"))
      router.refresh()
    } catch {
      toast.error(t("messages.unknownError"))
    }
  }

  const switchElement = (
    <Switch
      checked={isActive}
      className="absolute start-3 top-3 z-10"
      disabled={!canManageStatus || scheduledForDeletion}
      onCheckedChange={
        canManageStatus && !scheduledForDeletion
          ? handleCheckedChange
          : undefined
      }
      onClick={(e) => e.stopPropagation()}
    />
  )

  const disabledTooltip = scheduledForDeletion
    ? t("workspace.deletion.navDisabledTooltip")
    : t("workspace.schedule.permissionRequired")

  return (
    <>
      {canManageStatus && !scheduledForDeletion ? (
        switchElement
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="absolute z-10 inline-flex">{switchElement}</span>
            }
          />
          <TooltipContent>{disabledTooltip}</TooltipContent>
        </Tooltip>
      )}

      <WorkspaceScheduleDialog
        onOpenChange={setShowScheduleDialog}
        onSuccess={(savedSchedule) => {
          setIsActive(true)
          setSchedule(savedSchedule)
          router.refresh()
        }}
        open={showScheduleDialog}
        workspace={workspace}
      />
    </>
  )
}
