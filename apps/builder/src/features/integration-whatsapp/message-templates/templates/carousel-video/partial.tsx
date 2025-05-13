"use client"

import { InputField } from "@/components/form/input-field"
import { Button } from "@/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { useFormContext, useWatch } from "react-hook-form"
import { memo } from "react"

const VariableInput = memo(
  ({
    parentName,
    index,
    placeholder = "Type a message",
  }: {
    parentName: string
    index: number
    placeholder?: string
  }) => (
    <div className="flex gap-2 mt-2 w-full">
      <Button variant="secondary">{`{{${index + 1}}}`}</Button>
      <div className="flex-1">
        <InputField
          name={`${parentName}.variables.${index}`}
          placeholder={placeholder}
        />
      </div>
    </div>
  ),
)

const CardVariables = memo(
  ({
    parentName,
    cardIndex,
    variables,
  }: {
    parentName: string
    cardIndex: number
    variables: string[]
  }) => {
    const { t } = useTranslate()

    return (
      <div>
        <div className="mt-6">
          {t("common.sampleBodyCardContent")} ({cardIndex + 1})
        </div>
        {variables.map((_variable: string, index: number) => (
          <VariableInput
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            key={`${parentName}-card-${cardIndex}-var-${index}`}
            parentName={`${parentName}.cards.${cardIndex}.body`}
            index={index}
          />
        ))}
      </div>
    )
  },
)

const TemplateCarouselVideoPartialComponent = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { t } = useTranslate()
  const { control } = useFormContext()

  const [bodyVariables, cards] = useWatch({
    control,
    name: [`${parentName}.body.variables`, `${parentName}.cards`],
  })

  return (
    <div className="w-full flex-1" {...rest}>
      {bodyVariables.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleBodyContent")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            <VariableInput
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              key={`${parentName}-var-${index}`}
              parentName={`${parentName}.body`}
              index={index}
            />
          ))}
        </>
      )}
      {cards?.map(
        (card: { body: { variables: string[] } }, indexCard: number) => (
          <CardVariables
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            key={`${parentName}-card-${indexCard}`}
            parentName={parentName}
            cardIndex={indexCard}
            variables={card.body.variables}
          />
        ),
      )}
    </div>
  )
}

export const TemplateCarouselVideoPartial = memo(
  TemplateCarouselVideoPartialComponent,
)
