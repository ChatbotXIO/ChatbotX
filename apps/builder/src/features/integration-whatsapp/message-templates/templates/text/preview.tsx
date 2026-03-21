import { CardContent } from "@chatbotx.io/ui/components/ui/card"
import { memo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ButtonGroupPreview } from "../button/preview"
import { TemplateBody } from "../components/body"
import { TemplateFooter } from "../components/footer"
import { TemplateHeader } from "../components/header"

type TemplateTextPreviewComponentProps = {
  parentName?: string
}

const TemplateTextPreviewComponent = (
  props: TemplateTextPreviewComponentProps,
) => {
  const { parentName = "content", ...rest } = props

  const { control } = useFormContext()
  const hideHeader = useWatch({
    control,
    name: `${parentName}.hideHeader`,
  })
  const showFooter = useWatch({
    control,
    name: `${parentName}.showFooter`,
  })

  return (
    <CardContent className="rounded bg-white p-4">
      <div className="flex w-full flex-col gap-4" {...rest}>
        {hideHeader && <TemplateHeader parentName={`${parentName}.header`} />}
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupPreview parentName={`${parentName}.buttons`} />
      </div>
    </CardContent>
  )
}

export const TemplateTextPreview = memo(TemplateTextPreviewComponent)
