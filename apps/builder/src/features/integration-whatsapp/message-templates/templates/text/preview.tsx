import { useFormContext } from "react-hook-form"
import { TemplateFooter } from "../components/footer"
import { TemplateHeader } from "../components/header"
import { TemplateBody } from "../components/body"
import { ButtonGroupEditor } from "../button/preview"
import { CardContent } from "@/components/ui/card"

export const TemplateTextPreview = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { watch } = useFormContext()
  const showHeader = watch(`${parentName}.showHeader`)
  const showFooter = watch(`${parentName}.showFooter`)

  return (
    <CardContent className="bg-white p-4 rounded">
      <div className="w-full flex flex-col gap-4" {...rest}>
        {showHeader && <TemplateHeader parentName={`${parentName}.header`} />}
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </CardContent>
  )
}
