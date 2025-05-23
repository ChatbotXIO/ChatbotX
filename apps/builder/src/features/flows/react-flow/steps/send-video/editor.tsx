"use client"

import FileDropzone from "@/components/file-dropzone"
import { useFormContext } from "react-hook-form"
import { ButtonGroupEditor } from "../button/editor"
import { FileType } from "@ahachat.ai/database"

export function SendVideoStepEditor({ parentName }: { parentName: string }) {
  const { register, unregister } = useFormContext()

  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <FileDropzone
        register={register}
        unregister={unregister}
        parentName={parentName}
        mode="link"
        type={FileType.VIDEO}
        configs={{
          uploadKeyName: "common.uploadVideoOr",
          linkKeyName: "common.insertLink",
          accept: { "video/*": [] },
        }}
      />
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}
