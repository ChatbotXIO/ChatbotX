"use client"

import FileDropzone from "@/components/file-dropzone"
import { FileType } from "@ahachat.ai/database"
import { useFormContext } from "react-hook-form"

export function SendAudioStepEditor({ parentName }: { parentName: string }) {
  const { register, unregister } = useFormContext()

  return (
    <FileDropzone
      register={register}
      unregister={unregister}
      parentName={parentName}
      mode="link"
      type={FileType.AUDIO}
      configs={{
        uploadKeyName: "common.uploadAudioOr",
        linkKeyName: "common.insertLink",
        accept: { "audio/*": [] },
      }}
    />
  )
}
