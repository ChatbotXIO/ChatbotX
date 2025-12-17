"use client"

import {
  AssignerFilterType,
  ConversationStatus,
} from "@aha.chat/database/enums"
import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { MultiSelect } from "@aha.chat/ui/components/ui/sersavan/multi-select"
import { FilterIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { flatMap } from "remeda"
import type { ConversationFilters } from "../chat/store/chat-store"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { InboxResource } from "../inboxes/schemas/resource"
import { useContactAssigneeOptions } from "../users/provider/user-hook"

type UpdateConversationAssignerProps = {
  inboxes: InboxResource[]
  onChange: (value: ConversationFilters) => void
}

export function ConversationFilter({
  inboxes,
  onChange,
}: UpdateConversationAssignerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { filters } = useChatStore((state) => state)
  const hasFilter = Boolean(
    (filters.inboxType && filters.inboxType !== "all") ||
      (filters.assignedUserId && filters.assignedUserId !== "all") ||
      filters.status,
  )
  const contactAssigneeOptions = useContactAssigneeOptions()
  const assigneeOptions = flatMap(
    contactAssigneeOptions,
    (option) => option.children,
  ).filter((v) => v) as SelectOption[]

  const conversationStatusOptions = [
    {
      label: t("condition.fields.noAdminReply"),
      value: ConversationStatus.noAdminReply,
    },
    {
      label: t("condition.fields.unread"),
      value: ConversationStatus.unread,
    },
    {
      label: t("condition.fields.followUp"),
      value: ConversationStatus.followUp,
    },
    {
      label: t("condition.fields.archived"),
      value: ConversationStatus.archived,
    },
    {
      label: t("condition.fields.blocked"),
      value: ConversationStatus.blocked,
    },
  ]

  const onChangeAssigner = (value: string) => {
    onChange({ assignedUserId: value })
  }

  const onChangeInboxType = (value: string) => {
    onChange({ inboxType: value })
  }

  const onChangeStatus = (value: string[]) => {
    onChange({ status: value.join(",") })
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="px-2" size="sm" variant="outline">
          <FilterIcon className={hasFilter ? "text-primary" : ""} />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-4">
          <Select
            defaultValue={filters.inboxType || "all"}
            onValueChange={onChangeInboxType}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("channels.allChannels")}</SelectItem>
              {inboxes.map((inbox) => (
                <SelectItem key={inbox.inboxType} value={inbox.inboxType}>
                  {t(`fields.${inbox.inboxType}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            defaultValue={filters.assignedUserId || "all"}
            onValueChange={onChangeAssigner}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AssignerFilterType.all}>
                {t("assignAdmin.assignedAndUnassigned")}
              </SelectItem>
              <SelectItem value={AssignerFilterType.unassigned}>
                {t("assignAdmin.unAssigned")}
              </SelectItem>
              {assigneeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <MultiSelect
            defaultValue={filters.status ? filters.status.split(",") : []}
            modalPopover={true}
            onValueChange={onChangeStatus}
            options={conversationStatusOptions}
            placeholder={`${t("condition.fields.unread")}, ${t("condition.fields.followUp")}, ... `}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
