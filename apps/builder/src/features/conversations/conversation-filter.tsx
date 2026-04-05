"use client"

import {
  assignerFilterTypes,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
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
      (filters.assignedId &&
        filters.assignedId !== assignerFilterTypes.enum.all) ||
      filters.status,
  )
  const contactAssigneeOptions = useContactAssigneeOptions({
    includeAll: true,
    includeUnassigned: true,
  })

  const conversationStatusOptions = [
    {
      label: t("condition.fields.noAdminReply"),
      value: conversationStatuses.enum.noAdminReply,
      icon: CornerUpLeftIcon,
    },
    {
      label: t("condition.fields.unread"),
      value: conversationStatuses.enum.unread,
      icon: MailIcon,
    },
    {
      label: t("condition.fields.followUp"),
      value: conversationStatuses.enum.followUp,
      icon: StarIcon,
    },
    {
      label: t("condition.fields.archived"),
      value: conversationStatuses.enum.archived,
      icon: ArchiveIcon,
    },
    {
      label: t("condition.fields.blocked"),
      value: conversationStatuses.enum.blocked,
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
