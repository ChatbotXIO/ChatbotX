"use client"

import { FileType } from "@aha.chat/database/types"
import { useFormContext } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone"

export function SendAudioStepEditor({ parentName }: { parentName: string }) {
  const { register, unregister } = useFormContext()

  return (
    <FileDropzone
      configs={{
        uploadKeyName: "common.uploadAudioOr",
        linkKeyName: "common.insertLink",
        accept: { "audio/*": [] },
      }}
      mode="link"
      parentName={parentName}
      register={register}
      type={FileType.AUDIO}
      unregister={unregister}
    />
  )
}
