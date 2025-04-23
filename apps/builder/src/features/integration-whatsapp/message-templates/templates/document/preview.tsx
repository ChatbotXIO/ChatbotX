import { Controller, useFormContext } from "react-hook-form"
import { TemplateFooter } from "../components/footer"
import { TemplateBody } from "../components/body"
import { ButtonGroupEditor } from "../button/preview"
import FileDropzone from "@/components/file-dropzone"
import { CardContent } from "@/components/ui/card"

export const TemplateDocumentPreview = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { watch, register, unregister, control, setValue } = useFormContext()
  const showFooter = watch(`${parentName}.showFooter`)

  return (
    <CardContent className="bg-white p-4 rounded">
      <div className="w-full flex flex-col gap-4" {...rest}>
        <Controller
          control={control}
          name={`${parentName}.header.file`}
          render={() => (
            <FileDropzone
              register={register}
              unregister={unregister}
              parentName={`${parentName}.header`}
              configs={{
                uploadKeyName: "common.uploadDocument",
                accept: {
                  "application/pdf": [".pdf"],
                },
                isCard: true,
              }}
              onRemove={() =>
                setValue(`${parentName}.header.file`, null, {
                  shouldValidate: true,
                })
              }
              onDrop={(file) =>
                setValue(`${parentName}.header.file`, file, {
                  shouldValidate: true,
                })
              }
            />
          )}
        />
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </CardContent>
  )
}
