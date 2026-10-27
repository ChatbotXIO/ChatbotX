"use client"

import {
  type PipelineActivityGroup,
  pipelineActivityGroups,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { ListFilterIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { ACTIVITY_GROUP_LABEL_KEYS } from "../../lib/activity-group-keys"

type ActivityFilterProps = {
  /** Selected groups; empty shows every kind of change. */
  groups: readonly PipelineActivityGroup[]
  onGroupsChange: (groups: PipelineActivityGroup[]) => void
}

/** Which kinds of change the activity timeline shows (multi-select). */
export function ActivityFilter({
  groups,
  onGroupsChange,
}: ActivityFilterProps) {
  const t = useTranslations("pipelines")
  const toggle = (group: PipelineActivityGroup, checked: boolean) =>
    onGroupsChange(
      pipelineActivityGroups.options.filter((option) =>
        option === group ? checked : groups.includes(option),
      ),
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("item.activityFilter")}
            className="h-7 gap-1.5 px-2 text-xs"
            size="sm"
            variant={groups.length > 0 ? "secondary" : "ghost"}
          />
        }
      >
        <ListFilterIcon className="size-3.5" />
        {groups.length > 0
          ? t("item.activityFilterCount", { count: groups.length })
          : t("item.activityFilter")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {pipelineActivityGroups.options.map((group) => (
          <DropdownMenuCheckboxItem
            checked={groups.includes(group)}
            closeOnClick={false}
            key={group}
            onCheckedChange={(checked) => toggle(group, checked)}
          >
            {t(ACTIVITY_GROUP_LABEL_KEYS[group])}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={groups.length === 0}
          onClick={() => onGroupsChange([])}
        >
          {t("item.activityFilterClear")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
