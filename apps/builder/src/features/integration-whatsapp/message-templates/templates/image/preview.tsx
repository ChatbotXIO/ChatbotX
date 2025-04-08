import { Controller, useFormContext } from "react-hook-form"
import { TemplateFooter } from "../components/footer"
import { TemplateBody } from "../components/body"
import { ButtonGroupEditor } from "../button/preview"
import FileDropzone from "@/components/file-dropzone"
import { CardContent } from "@/components/ui/card"

export const TemplateImagePreview = ({
  parentName = "content",
  maxButtons = 3,
  ...rest
}: {
  parentName?: string
  maxButtons?: number
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
                uploadKeyName: "common.uploadImage",
                accept: {
                  "image/png": [".png"],
                  "image/jpg": [".jpg"],
                  "image/jpeg": [".jpeg"],
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
        <ButtonGroupEditor
          parentName={`${parentName}.buttons`}
          max={maxButtons}
        />
      </div>
    </CardContent>
  )
}
