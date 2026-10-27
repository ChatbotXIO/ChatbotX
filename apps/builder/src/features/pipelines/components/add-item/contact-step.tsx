"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { ContactSearchCombobox } from "@/features/contacts/components/contact-search-combobox"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { contactDisplayName } from "@/features/contacts/lib/contact-display-name"
import { formatItemAge } from "../../lib/format-item-value"

export type PickedContact = {
  id: string
  name: string
  avatar?: string | null
}

/** Step 1: find the contact the new item belongs to (or create one). */
export function ContactStep({
  workspaceId,
  open,
  onPick,
}: {
  workspaceId: string
  open: boolean
  onPick: (contact: PickedContact) => void
}) {
  const t = useTranslations("pipelines")
  const locale = useLocale()

  return (
    <div className="grid gap-3 px-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{t("add.contact")}</span>
        <CreateContactDialog
          onCreated={(created) =>
            onPick({
              id: created.id,
              name: contactDisplayName(created) ?? created.id,
              avatar: created.avatar,
            })
          }
          trigger={
            <Button size="sm" variant="outline">
              <PlusIcon />
              {t("add.addNewContact")}
            </Button>
          }
          workspaceId={workspaceId}
        />
      </div>
      <ContactSearchCombobox
        autoFocus
        enabled={open}
        onSelect={({ id, name, avatar }) => onPick({ id, name, avatar })}
        renderMeta={({ createdAt }) =>
          createdAt ? formatItemAge(createdAt, locale) : null
        }
        workspaceId={workspaceId}
      />
    </div>
  )
}
