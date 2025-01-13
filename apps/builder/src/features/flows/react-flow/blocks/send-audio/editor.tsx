"use client"

import FileDropzone from "@/components/file-dropzone"
import { useFormContext } from "react-hook-form"

export function SendAudioBlockEditor({ parentName }: { parentName: string }) {
  const { register, unregister } = useFormContext()

  return (
    <FileDropzone
      register={register}
      unregister={unregister}
      parentName={parentName}
      mode="link"
      type="audio"
      configs={{
        uploadKeyName: "common.uploadAudioOr",
        linkKeyName: "common.insertLink",
        accept: { "audio/*": [] },
      }}
    />
  )
}
