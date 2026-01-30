import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { CreateCustomFieldDialog } from "./create-custom-field"
import { useCustomFieldSelectOptions } from "./provider/custom-field-hook"
import { useCustomFieldStore } from "./provider/custom-field-store-context"

type ContactCustomFieldManageProps = {
  chatbotId: string
  disabledIds: string[]
  onChooseCustomField: (customFieldId: string) => void
}

export function ContactCustomFieldManage({
  chatbotId,
  disabledIds = [],
  onChooseCustomField,
}: ContactCustomFieldManageProps) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<SelectOption[]>([])

  const { getAllCustomFields } = useCustomFieldStore((state) => state)
  const customFieldOptions = useCustomFieldSelectOptions({
    includeReserved: false,
  })

  useEffect(() => {
    const filteredOptions = customFieldOptions.filter(
      (option) => !disabledIds.includes(option.value),
    )
    setOptions(filteredOptions)
  }, [customFieldOptions, disabledIds])

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="flex cursor-pointer justify-start px-0!"
          variant="link"
        >
          <PlusCircleIcon />
          {t("actions.addFeature", { feature: t("fields.customField.label") })}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="mb-3 flex items-center">
          <p className="flex-1 font-medium">{t("fields.customField.label")}</p>
          <CreateCustomFieldDialog
            chatbotId={chatbotId}
            folderId={null}
            onSuccess={() => {
              getAllCustomFields()
              setOpen(false)
            }}
            triggerButton={
              <Button size="sm" type="button" variant="outline">
                <PlusCircleIcon />
                {t("actions.add")}
              </Button>
            }
          />
        </div>

        <Command className="rounded-lg border">
          <CommandInput className="h-9" placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No record found.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                onSelect={() => {
                  onChooseCustomField(option.value)
                  setOpen(false)
                }}
                value={option.value}
              >
                {option.icon && <option.icon className="h-4 w-4" />}
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
