"use client"

import {
  type FacebookLeadFieldMapping,
  FB_LEAD_STANDARD_FIELD_TARGET,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ArrowRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"

// Reserved system fields offered as mapping targets (plus every workspace
// custom field), derived from the shared FB standard-field map so the two
// stay in sync. `inbox_url` questions are filtered out by the caller.
const RESERVED_TARGETS = Object.values(FB_LEAD_STANDARD_FIELD_TARGET)

export function LeadDataMapping({
  entries,
  workspaceId,
}: {
  entries: FacebookLeadFieldMapping[]
  workspaceId: string
}) {
  const t = useTranslations()
  const getAllCustomFields = useCustomFieldStore(
    (state) => state.getAllCustomFields,
  )

  // A leading "None" option makes each row clearable back to unmapped —
  // ComboboxField never toggles a selection off on its own.
  const targetOptions: SelectOption[] = [
    { label: t("messages.none"), value: "" },
    ...useCustomFieldSelectOptions({
      includeReserved: true,
      reservedFieldIds: RESERVED_TARGETS,
    }),
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {t("facebookLeadAdsAutomation.leadData")}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {t("fields.customField.label")}
          </span>
          <CreateCustomFieldDialog
            folderId={null}
            onSuccess={getAllCustomFields}
            triggerButton={
              <Button className="h-auto p-0" variant="link">
                {t("actions.add")}
              </Button>
            }
            workspaceId={workspaceId}
          />
        </div>
      </div>

      {entries.map((entry, index) => (
        <div className="flex items-center gap-2" key={entry.key}>
          <div className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-muted-foreground text-sm">
            {entry.label}
          </div>
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          <div className="flex-1">
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              name={`fieldMapping.${index}.target`}
              options={targetOptions}
              placeholder={t("messages.none")}
              popoverClassName="w-[var(--anchor-width)]"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
