"use client"

import { InputField } from "@/components/form/input-field"
import { Button } from "@/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { useFormContext } from "react-hook-form"

export const TemplateCarouselVideoPartial = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { t } = useTranslate()
  const { watch } = useFormContext()
  const [bodyVariables, cards] = watch([
    `${parentName}.body.variables`,
    `${parentName}.cards`,
  ])

  return (
    <div className="w-full flex-1" {...rest}>
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
                  label=""
                  placeholder="Type a message"
                />
              </div>
            </div>
          ))}
        </>
      )}
      {cards?.map(
        (card: { body: { variables: string[] } }, indexCard: number) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <div key={indexCard}>
            <div className="mt-6">
              {t("common.sampleBodyCardContent")} ({indexCard + 1})
            </div>
            {card.body.variables.map((_variable: string, index: number) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              <div key={index} className="flex gap-2 mt-2 w-full">
                <Button variant="secondary">{`{{${index + 1}}}`}</Button>
                <div className="flex-1">
                  <InputField
                    name={`${parentName}.cards.${indexCard}.body.variables.${index}`}
                    placeholder="Type a message"
                  />
                </div>
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  )
}
