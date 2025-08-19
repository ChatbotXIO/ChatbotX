"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { memo, useCallback } from "react"
import { useFormContext, useWatch } from "react-hook-form"

const VariableInput = memo(
  ({ parentName, index }: { parentName: string; index: number }) => {
    return (
      <div className="mt-2 flex w-full gap-2">
        <Button variant="secondary">{`{{${index + 1}}}`}</Button>
        <div className="flex-1">
          <InputField
            name={`${parentName}.body.variables.${index}`}
            placeholder="Type a message"
          />
        </div>
      </div>
    )
  },
)

const TemplateCatalogPartialComponent = (props: { parentName?: string }) => {
  const { parentName = "content", ...rest } = props
  const { t } = useTranslate()
  const { control, setValue } = useFormContext()

  const [bodyVariables, _showFooter] = useWatch({
    control,
    name: [`${parentName}.body.variables`, `${parentName}.showFooter`],
  })

  const _handleFooterChange = useCallback(
    (value: boolean) => {
      setValue(`${parentName}.showFooter`, value, {
        shouldValidate: true,
      })
    },
    [parentName, setValue],
  )

  return (
    <div className="w-full flex-1" {...rest}>
      <div className="flex gap-4">
        <CheckboxGroupField
          name={`${parentName}.showFooter`}
          options={[
            {
              label: "Show footer",
              value: "showFooter",
            },
          ]}
        />
      </div>
      {bodyVariables.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleBodyContent")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            <VariableInput
              index={index}
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              key={`${parentName}-variable-${index}`}
              parentName={parentName}
            />
          ))}
        </>
      )}
    </div>
  )
}

export const TemplateCatalogPartial = memo(TemplateCatalogPartialComponent)
