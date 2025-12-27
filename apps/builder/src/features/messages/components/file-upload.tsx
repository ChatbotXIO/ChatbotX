import type { FileWithPreview } from "@aha.chat/filesystem"
import { Button } from "@aha.chat/ui/components/ui/button"
import { XCircleIcon } from "lucide-react"
import Image from "next/image"
import { useImperativeHandle } from "react"
import { useDropzone } from "react-dropzone"
import { Controller, useFormContext } from "react-hook-form"

export const FileUploadPreview = ({
  ref,
  maxFiles = 1,
}: {
  maxFiles?: number
} & {
  ref: React.RefObject<unknown>
}) => {
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

  const thumbs = getValues("files").map((file: FileWithPreview) => (
    <div className="relative rounded-md border" key={file.name}>
      <div className="max-w-36 overflow-hidden rounded-md">
        {file.type.startsWith("image") ? (
          <Image
            alt="file"
            className="h-16 w-auto"
            height={64}
            onLoad={() => {
              URL.revokeObjectURL(file.preview)
            }}
            src={file.preview}
            width={64}
          />
        ) : (
          <div className="truncate bg-white px-2 py-1 text-sm">{file.name}</div>
        )}
      </div>

      <Button
        className="absolute -top-2 -right-2 h-auto rounded-full bg-white p-0 px-0"
        onClick={() => onRemoveChooseFile(file.name)}
        type="button"
        variant="ghost"
      >
        <XCircleIcon />
      </Button>
    </div>
  ))

  // useEffect(() => {
  //   // Make sure to revoke the data uris to avoid memory leaks, will run on unmount
  //   // biome-ignore lint/complexity/noForEach: wip
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
      <aside className="flex items-center gap-2">{thumbs}</aside>
    </section>
  )
}
