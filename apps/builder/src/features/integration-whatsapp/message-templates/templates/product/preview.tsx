import { useFormContext, useWatch } from "react-hook-form"
import { TemplateFooter } from "../components/footer"
import { TemplateHeader } from "../components/header"
import { TemplateBody } from "../components/body"
import { ButtonGroupPreview } from "../button/preview"
import { CardContent } from "@/components/ui/card"
import { memo } from "react"

const TemplateProductPreviewComponent = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { control } = useFormContext()
  const showFooter = useWatch({
    control,
    name: `${parentName}.showFooter`,
  })

  return (
    <CardContent className="bg-white p-4 rounded">
      <div className="w-full flex flex-col gap-4" {...rest}>
        <TemplateHeader parentName={`${parentName}.header`} />
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupPreview
          parentName={`${parentName}.buttons`}
          changeType={false}
          min={1}
          max={1}
        />
      </div>
    </CardContent>
  )
}

export const TemplateProductPreview = memo(TemplateProductPreviewComponent)
