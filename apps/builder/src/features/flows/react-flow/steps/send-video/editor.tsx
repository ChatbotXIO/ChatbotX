"use client"

import { FileType } from "@aha.chat/database/types"
import { useFormContext } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone"
import { ButtonGroupEditor } from "../button/editor"

export function SendVideoStepEditor({ parentName }: { parentName: string }) {
  const { register, unregister } = useFormContext()

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <FileDropzone
        configs={{
          uploadKeyName: "common.uploadVideoOr",
          linkKeyName: "common.insertLink",
          accept: { "video/*": [] },
        }}
        mode="link"
        parentName={parentName}
        register={register}
        type={FileType.VIDEO}
        unregister={unregister}
      />
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}
