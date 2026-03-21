import { CardContent } from "@chatbotx.io/ui/components/ui/card"
import { memo, useCallback } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone"
import { ButtonGroupPreview } from "../button/preview"
import { TemplateBody } from "../components/body"
import { TemplateFooter } from "../components/footer"

type TemplateImagePreviewComponentProps = {
  parentName?: string
  minButtons?: number
  maxButtons?: number
}

const TemplateImagePreviewComponent = (
  props: TemplateImagePreviewComponentProps,
) => {
  const {
    parentName = "content",
    minButtons = 0,
    maxButtons = 3,
    ...rest
  } = props

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
    <CardContent className="rounded bg-white p-4">
      <div className="flex w-full flex-col gap-4" {...rest}>
        <Controller
          control={control}
          name={`${parentName}.header.file`}
          render={() => (
            <FileDropzone
              configs={{
                uploadKeyName: "actions.uploadImage",
                accept: {
                  "image/png": [".png"],
                  "image/jpg": [".jpg"],
                  "image/jpeg": [".jpeg"],
                },
                isCard: true,
              }}
              onDrop={handleDrop}
              onRemove={handleRemove}
              parentName={`${parentName}.header`}
              register={register}
              unregister={unregister}
            />
          )}
        />
        <TemplateBody parentName={`${parentName}.body`} />
        {showFooter && <TemplateFooter parentName={parentName} />}
        <hr />
        <ButtonGroupPreview
          max={maxButtons}
          min={minButtons}
          parentName={`${parentName}.buttons`}
        />
      </div>
    </CardContent>
  )
}

export const TemplateImagePreview = memo(TemplateImagePreviewComponent)
