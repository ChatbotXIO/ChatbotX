import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { CreateCustomFieldDialog } from "./create-custom-field"
import {
  useCustomFieldSelectOptions,
  useCustomFields,
  useInvalidateCustomFields,
} from "./provider/custom-field-hook"

type ContactCustomFieldManageProps = {
  workspaceId: string
  disabledIds: string[]
  onChooseCustomField: (field: {
    id: string
    name: string
    type: CustomFieldType
  }) => void
}

type ContactCustomFieldPickerContentProps = ContactCustomFieldManageProps & {
  onClose: () => void
}

export function ContactCustomFieldManage({
  workspaceId,
  disabledIds = [],
  onChooseCustomField,
}: ContactCustomFieldManageProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="flex cursor-pointer justify-start px-0!"
            variant="link"
          >
            <PlusCircleIcon />
            {t("actions.addFeature", {
              feature: t("fields.customField.label"),
            })}
          </Button>
        }
      />
      <PopoverContent>
        {open ? (
          <ContactCustomFieldPickerContent
            disabledIds={disabledIds}
            onChooseCustomField={onChooseCustomField}
            onClose={() => setOpen(false)}
            workspaceId={workspaceId}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function ContactCustomFieldPickerContent({
  workspaceId,
  disabledIds,
  onChooseCustomField,
  onClose,
}: ContactCustomFieldPickerContentProps) {
  const t = useTranslations()
  const { data: customFields = [] } = useCustomFields(workspaceId)
  const customFieldOptions = useCustomFieldSelectOptions({
    includeReserved: false,
  })
  const invalidateCustomFields = useInvalidateCustomFields()
  const options = useMemo(
    () =>
      customFieldOptions.filter(
        (option) => !disabledIds.includes(option.value),
      ),
    [customFieldOptions, disabledIds],
  )

  const handleChooseCustomField = (customFieldId: string) => {
    const customField = customFields.find((field) => field.id === customFieldId)
    if (!customField) {
      return
    }

    onChooseCustomField({
      id: customField.id,
      name: customField.name,
      type: customField.type,
    })
    onClose()
  }

  const handleCreateCustomFieldSuccess = () => {
    invalidateCustomFields()
    onClose()
  }

  return (
    <>
      <div className="mb-3 flex items-center">
        <p className="flex-1 font-medium">{t("fields.customField.label")}</p>
        <CreateCustomFieldDialog
          folderId={null}
          onSuccess={handleCreateCustomFieldSuccess}
          triggerButton={
            <Button size="sm" type="button" variant="outline">
              <PlusCircleIcon />
              {t("actions.add")}
            </Button>
          }
          workspaceId={workspaceId}
        />
      </div>

      <Command className="rounded-lg border">
        <CommandInput className="h-9" placeholder={t("actions.search")} />
        <CommandList>
          <CommandEmpty>{t("actions.noRecordFound")}</CommandEmpty>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              onSelect={() => handleChooseCustomField(option.value)}
              value={option.value}
            >
              {option.icon && <option.icon className="h-4 w-4" />}
              {option.label}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </>
  )
}
