import { useFormContext } from "react-hook-form"
import { TemplateFooter } from "../components/footer"
import { TemplateHeader } from "../components/header"
import { TemplateBody } from "../components/body"
import { ButtonGroupEditor } from "../button/preview"
import { CardContent } from "@/components/ui/card"

export const TemplateProductPreview = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { watch } = useFormContext()
  const showFooter = watch(`${parentName}.showFooter`)

  return (
    <CardContent className="bg-white p-4 rounded">
      <div className="w-full flex flex-col gap-4" {...rest}>
        <TemplateHeader parentName={`${parentName}.header`} />
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupEditor
          parentName={`${parentName}.buttons`}
          changeType={false}
          min={1}
          max={1}
        />
      </div>
    </CardContent>
  )
}
