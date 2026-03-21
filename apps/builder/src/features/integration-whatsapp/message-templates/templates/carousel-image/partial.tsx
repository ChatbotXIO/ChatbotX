"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { useFormContext, useWatch } from "react-hook-form"

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
    <div className="mt-2 flex w-full gap-2">
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
    const t = useTranslations()

    return (
      <div>
        <div className="mt-6">
          {t("whatsapp.sampleBodyCardContent.label")} ({cardIndex + 1})
        </div>
        {variables.map((_variable: string, index: number) => (
          <VariableInput
            index={index}
            // biome-ignore lint/suspicious/noArrayIndexKey: wip
            key={`${parentName}-card-${cardIndex}-var-${index}`}
            parentName={`${parentName}.cards.${cardIndex}.body`}
          />
        ))}
      </div>
    )
  },
)

type TemplateCarouselImagePartialComponentProps = {
  parentName?: string
}

const TemplateCarouselImagePartialComponent = (
  props: TemplateCarouselImagePartialComponentProps,
) => {
  const { parentName = "content", ...rest } = props
  const t = useTranslations()
  const { control } = useFormContext()

  const [bodyVariables, cards] = useWatch({
    control,
    name: [`${parentName}.body.variables`, `${parentName}.cards`],
  })

  return (
    <div className="w-full flex-1" {...rest}>
      {bodyVariables.length > 0 && (
        <>
          <div className="mt-6">{t("whatsapp.sampleBodyContent.label")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            <VariableInput
              index={index}
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              key={`${parentName}-var-${index}`}
              parentName={`${parentName}.body`}
            />
          ))}
        </>
      )}
      {cards?.map(
        (card: { body: { variables: string[] } }, indexCard: number) => (
          <CardVariables
            cardIndex={indexCard}
            // biome-ignore lint/suspicious/noArrayIndexKey: wip
            key={`${parentName}-card-${indexCard}`}
            parentName={parentName}
            variables={card.body.variables}
          />
        ),
      )}
    </div>
  )
}

export const TemplateCarouselImagePartial = memo(
  TemplateCarouselImagePartialComponent,
)
