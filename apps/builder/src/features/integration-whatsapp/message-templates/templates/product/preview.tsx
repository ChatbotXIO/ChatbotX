import { CardContent } from "@chatbotx.io/ui/components/ui/card"
import { memo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ButtonGroupPreview } from "../button/preview"
import { TemplateBody } from "../components/body"
import { TemplateFooter } from "../components/footer"
import { TemplateHeader } from "../components/header"

type TemplateProductPreviewComponentProps = {
  parentName?: string
}

const TemplateProductPreviewComponent = (
  props: TemplateProductPreviewComponentProps,
) => {
  const { parentName = "content", ...rest } = props

  const { control } = useFormContext()
  const showFooter = useWatch({
    control,
    name: `${parentName}.showFooter`,
  })

  return (
    <CardContent className="rounded bg-white p-4">
      <div className="flex w-full flex-col gap-4" {...rest}>
        <TemplateHeader parentName={`${parentName}.header`} />
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupPreview
          changeType={false}
          max={1}
          min={1}
          parentName={`${parentName}.buttons`}
        />
      </div>
    </CardContent>
  )
}

export const TemplateProductPreview = memo(TemplateProductPreviewComponent)
