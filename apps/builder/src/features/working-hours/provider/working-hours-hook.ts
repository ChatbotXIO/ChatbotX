import { ASSIGNED_AGENT_WORKING_HOURS_VALUE } from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/**
 * Options for the flow Condition "Within working hours" field: each schedule,
 * plus the assigned agent's own shift. Only fetched when `enabled`.
 */
export const useWorkingHoursOptions = (options?: {
  enabled?: boolean
}): SelectOption[] => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { data: schedules } = useQuery(
    orpc.workingHoursAPI.listWorkingHoursOptionsWorkspaceAuthAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

  return useMemo(
    () => [
      {
        label: t("workingHours.condition.assignedAgent"),
        value: ASSIGNED_AGENT_WORKING_HOURS_VALUE,
      },
      ...(schedules ?? []).map((schedule) => ({
        label: schedule.name,
        value: schedule.id,
      })),
    ],
    [schedules, t],
  )
}

/** Call after creating, renaming or deleting a schedule so the flow Condition options refresh. */
export const useInvalidateWorkingHoursOptions = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey:
          orpc.workingHoursAPI.listWorkingHoursOptionsWorkspaceAuthAPI.key(),
      }),
    [queryClient],
  )
}
