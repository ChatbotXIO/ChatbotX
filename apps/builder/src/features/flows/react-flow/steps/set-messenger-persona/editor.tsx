"use client"

import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { UserIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { BaseStepEditor } from "../base/editor"

// An empty/falsy personaId means "use the page default persona". Radix's Select
// forbids an empty-string item value, so the default choice uses a sentinel
// mapped back to "" on change.
const PAGE_DEFAULT_VALUE = "__page_default__"

const Selector = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const personas = useFlowTemplate((s) => s.messengerPersonas)
  const { control } = useFormContext()

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <FormField
        control={control}
        name={`${parentName}.personaId`}
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Select
                onValueChange={(value) =>
                  field.onChange(value === PAGE_DEFAULT_VALUE ? "" : value)
                }
                value={field.value || PAGE_DEFAULT_VALUE}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("fields.persona.pageDefault")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PAGE_DEFAULT_VALUE}>
                    {t("fields.persona.pageDefault")}
                  </SelectItem>
                  {personas.map((persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {`${persona.name} — ${persona.pageName}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

const SetMessengerPersonaStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={UserIcon}
      title={t("flows.actions.setMessengerPersona")}
    >
      <Selector parentName={parentName} />
    </BaseStepEditor>
  )
}

export default SetMessengerPersonaStepEditor
