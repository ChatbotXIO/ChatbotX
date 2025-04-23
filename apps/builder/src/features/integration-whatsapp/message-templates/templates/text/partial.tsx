"use client"

import { useFormContext } from "react-hook-form"
import { FormInput } from "@/components/form-input"
import { Checkbox } from "@/components/ui/checkbox"
import { useTranslate } from "@tolgee/react"
import { Button } from "@/components/ui/button"
import { InputField } from "@/components/form/input-field"

export const TemplateTextPartial = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { t } = useTranslate()
  const { watch, setValue } = useFormContext()
  const [headerVariables, bodyVariables] = watch([
    `${parentName}.header.variables`,
    `${parentName}.body.variables`,
  ])
  const showHeader = watch(`${parentName}.showHeader`)
  const showFooter = watch(`${parentName}.showFooter`)

  return (
    <div className="w-full flex-1" {...rest}>
      <div className="flex gap-4">
        <FormInput
          name={`${parentName}.showHeader`}
          label={t("whatapp.templateHeader")}
        >
          <Checkbox
            id="templateHeader"
            className="flex gap-2"
            defaultChecked={showHeader}
            onCheckedChange={(value) =>
              setValue(`${parentName}.showHeader`, value, {
                shouldValidate: true,
              })
            }
          />
        </FormInput>

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
      {headerVariables?.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleHeaderContent")}</div>
          {headerVariables.map((_variable: string, index: number) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            <div key={index + 1} className="flex gap-2 mt-2 w-full">
              <Button variant="secondary">{`{{${index + 1}}}`}</Button>
              <div className="flex-1">
                <InputField
                  name={`${parentName}.header.variables.${index}`}
                  placeholder="Type a message"
                />
              </div>
            </div>
          ))}
        </>
      )}
      {bodyVariables?.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleBodyContent")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            <div key={index + 1} className="flex gap-2 mt-2 w-full">
              <Button variant="secondary">{`{{${index + 1}}}`}</Button>
              <div className="flex-1">
                <FormInput
                  name={`${parentName}.body.variables.${index}`}
                  label=""
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
