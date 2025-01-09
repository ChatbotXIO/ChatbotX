'use client'

import { useFormContext } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone";

interface AudioBlockEditorProps {
  parentName: string
}

export function AudioBlockEditor({ parentName }: AudioBlockEditorProps) {
  const { register, unregister } = useFormContext()

  return <FileDropzone
    register={register}
    unregister={unregister}
    parentName={parentName}
    mode="link"
    type="audio"
    configs={{
      uploadKeyName: 'common.uploadAudioOr',
      linkKeyName: 'common.insertLink',
      accept: {'audio/*': []}
    }}
  />
}
