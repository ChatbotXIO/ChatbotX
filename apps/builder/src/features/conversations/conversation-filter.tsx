"use client"

import { ConversationStatus } from "@aha.chat/database/enums"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import {
  ArchiveIcon,
  CornerUpLeftIcon,
  FilterIcon,
  MailIcon,
  StarIcon,
  UserLockIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactFilterDialog } from "../contacts/components/contact-filter"
import { useConfiguredInboxTypeOptions } from "../inboxes/provider/inbox-hook"
import { useContactAssigneeOptions } from "../users/provider/user-hook"

export function ConversationFilter() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { filters } = useChatStore((state) => state)

  const inboxOptions = useConfiguredInboxTypeOptions()

  const hasFilter = Boolean(
    (filters.channel && filters.channel !== "omnichannel") ||
      (filters.assignedUserId && filters.assignedUserId !== "omnichannel") ||
      filters.status,
  )
  const contactAssigneeOptions = useContactAssigneeOptions({
    includeAll: true,
    includeUnassigned: true,
  })

  const conversationStatusOptions = [
    {
      label: t("condition.fields.noAdminReply"),
      value: ConversationStatus.noAdminReply,
      icon: CornerUpLeftIcon,
    },
    {
      label: t("condition.fields.unread"),
      value: ConversationStatus.unread,
      icon: MailIcon,
    },
    {
      label: t("condition.fields.followUp"),
      value: ConversationStatus.followUp,
      icon: StarIcon,
    },
    {
      label: t("condition.fields.archived"),
      value: ConversationStatus.archived,
      icon: ArchiveIcon,
    },
    {
      label: t("condition.fields.blocked"),
      value: ConversationStatus.blocked,
      icon: UserLockIcon,
    },
  ]

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="px-2" size="sm" variant="outline">
          <FilterIcon className={hasFilter ? "text-primary" : ""} />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-4">
          <SelectField
            label={t("fields.channel.label")}
            name="channel"
            options={inboxOptions}
            required
          />

          <ComboboxField
            label={t("fields.assignedId.label")}
            name="assignedUserId"
            options={contactAssigneeOptions}
            required
          />

          <MultiSelectField
            label={t("fields.status.label")}
            name="status"
            options={conversationStatusOptions}
            placeholder={`${t("condition.fields.unread")}, ${t("condition.fields.followUp")}, ... `}
            required
          />

          <ContactFilterDialog />
        </div>
      </PopoverContent>
    </Popover>
  )
}
