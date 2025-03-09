import { Button } from "@/components/ui/button"
import type { FileWithPreview } from "@ahachat.ai/filesystem"
import { XCircleIcon } from "lucide-react"
import { forwardRef, useImperativeHandle } from "react"
import { useDropzone } from "react-dropzone"
import { Controller, useFormContext } from "react-hook-form"

export const FileUploadPreview = forwardRef(
  (
    {
      maxFiles = 1,
    }: {
      maxFiles?: number
    },
    ref,
  ) => {
    const { control, setValue, getValues } = useFormContext()

    const { getRootProps, getInputProps, open } = useDropzone({
      noClick: true,
      maxFiles,
      maxSize: 5 * 1024 * 1024,
      multiple: maxFiles > 1,
      noKeyboard: true,
      onDrop: (acceptedFiles) => {
        setValue(
          "files",
          acceptedFiles.map((file) =>
            Object.assign(file, {
              preview: URL.createObjectURL(file),
            }),
          ),
        )
      },
    })

    useImperativeHandle(ref, () => ({
      openFileDialog: open,
    }))

    const onRemoveChooseFile = (fileName: string) => {
      const files: FileWithPreview[] = getValues("files")
      const filteredFiles = files.filter((file, _) => file.name !== fileName)
      setValue("files", filteredFiles, { shouldValidate: true })
    }

    const thumbs = getValues("files").map((file: FileWithPreview) => {
      return (
        <div key={file.name} className="relative border rounded-md">
          <div className="rounded-md overflow-hidden max-w-36">
            {file.type.startsWith("image") ? (
              <img
                src={file.preview}
                className="h-16"
                alt="file"
                // Revoke data uri after image is loaded
                onLoad={() => {
                  URL.revokeObjectURL(file.preview)
                }}
              />
            ) : (
              <div className="px-2 py-1 bg-white truncate text-sm">
                {file.name}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            className="absolute -top-2 -right-2 p-0 h-auto bg-white rounded-full"
            onClick={() => onRemoveChooseFile(file.name)}
          >
            <XCircleIcon />
          </Button>
        </div>
      )
    })

    // useEffect(() => {
    //   // Make sure to revoke the data uris to avoid memory leaks, will run on unmount
    //   // biome-ignore lint/complexity/noForEach: <explanation>
    //   return () => files.forEach((file) => URL.revokeObjectURL(file.preview))
    // }, [files])

    return (
      <section className="dropzone-container">
        <Controller
          control={control}
          name="files"
          render={({ field: { onChange } }) => (
            <div {...getRootProps()}>
              <input
                {...getInputProps({
                  onChange: (e) => {
                    onChange([e.target.files?.[0]])
                  },
                })}
              />
            </div>
          )}
        />
        <aside className="flex gap-2 items-center">{thumbs}</aside>
      </section>
    )
  },
)
