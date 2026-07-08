"use client"

import {
  contactFilterFields,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
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
import { useFormContext, useWatch } from "react-hook-form"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactFilterDialog } from "../contact-filter"
import { useConfiguredInboxTypeOptions } from "../inboxes/provider/inbox-hook"
import { useContactAssigneeOptions } from "../users/provider/user-hook"

// Channel is picked in the top-level filter above, so the contact filter's own
// "Channel" condition is redundant here; the Inbox condition is scoped to that
// chosen channel ("omnichannel" → all channels).
const EXCLUDED_FILTER_FIELDS = [contactFilterFields.enum.currentChannel]

export function ConversationFilter() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { filters } = useChatStore((state) => state)
  const { control } = useFormContext()
  const watchedChannel = useWatch({ control, name: "channel" }) as
    | string
    | undefined

  const inboxOptions = useConfiguredInboxTypeOptions()

  const filterCount = filters.contactFilter?.conditions.length ?? 0
  const hasFilter = filterCount > 0

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
        <Button className="relative px-2" size="sm" variant="outline">
          <FilterIcon className={hasFilter ? "text-primary" : ""} />
          {hasFilter && (
            <Badge className="absolute -top-1.5 -right-1.5 size-4 justify-center rounded-full p-0 text-[10px]">
              {filterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-2rem),36rem)]">
        <div className="flex flex-col gap-4">
          <SelectField
            label={t("fields.channel.label")}
            name="channel"
            options={inboxOptions}
            required
          />

          <ComboboxField
            emptyText={t("actions.noRecordFound")}
            label={t("fields.assignedId.label")}
            name="assignedId"
            options={contactAssigneeOptions}
            placeholder={t("actions.pleaseSelect")}
            required
          />

          <MultiSelectField
            label={t("fields.tags.label")}
            name="tags"
            options={conversationStatusOptions}
            placeholder={`${t("condition.fields.unread")}, ${t("condition.fields.followUp")}, ... `}
            required
          />

          <ContactFilterDialog
            btnTitle={t("fields.contactFilter.moreOptions")}
            excludeFields={EXCLUDED_FILTER_FIELDS}
            inboxChannel={watchedChannel}
            onSubmitted={(submitted) => {
              if (submitted.conditions.length > 0) {
                setOpen(false)
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
