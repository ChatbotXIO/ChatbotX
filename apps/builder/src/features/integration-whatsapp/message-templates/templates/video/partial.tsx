"use client"

import { useFormContext } from "react-hook-form"
import { FormInput } from "@/components/form-input"
import { Checkbox } from "@/components/ui/checkbox"
import { useTranslate } from "@tolgee/react"
import { Button } from "@/components/ui/button"
import { InputField } from "@/components/form/input-field"

export const TemplateVideoPartial = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { t } = useTranslate()
  const { watch, setValue } = useFormContext()
  const [bodyVariables] = watch([`${parentName}.body.variables`])
  const showFooter = watch(`${parentName}.showFooter`)

  return (
    <div className="w-full flex-1" {...rest}>
      <div className="flex gap-4">
        <FormInput
          name={`${parentName}.showFooter`}
          label={t("whatapp.templateFooter")}
        >
          <Checkbox
            id="templateHeader"
            className="flex gap-2"
            defaultChecked={showFooter}
            onCheckedChange={(value) =>
              setValue(`${parentName}.showFooter`, value, {
                shouldValidate: true,
              })
            }
          />
        </FormInput>
      </div>
      {bodyVariables.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleBodyContent")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            <div key={index + 1} className="flex gap-2 mt-2 w-full">
              <Button variant="secondary">{`{{${index + 1}}}`}</Button>
              <div className="flex-1">
                <InputField
                  name={`${parentName}.body.variables.${index}`}
                  placeholder="Type a message"
                />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
