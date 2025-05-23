import { Controller, useFormContext, useWatch } from "react-hook-form"
import { TemplateFooter } from "../components/footer"
import { TemplateBody } from "../components/body"
import { ButtonGroupPreview } from "../button/preview"
import FileDropzone from "@/components/file-dropzone"
import { CardContent } from "@/components/ui/card"
import { memo, useCallback } from "react"

const TemplateDocumentPreviewComponent = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { register, unregister, control, setValue } = useFormContext()
  const showFooter = useWatch({
    control,
    name: `${parentName}.showFooter`,
  })

  const handleRemove = useCallback(() => {
    setValue(`${parentName}.header.file`, null, {
      shouldValidate: true,
    })
  }, [parentName, setValue])

  const handleDrop = useCallback(
    (file: File) => {
      setValue(`${parentName}.header.file`, file, {
        shouldValidate: true,
      })
    },
    [parentName, setValue],
  )

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
              onRemove={handleRemove}
              onDrop={handleDrop}
            />
          )}
        />
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupPreview parentName={`${parentName}.buttons`} />
      </div>
    </CardContent>
  )
}

export const TemplateDocumentPreview = memo(TemplateDocumentPreviewComponent)
