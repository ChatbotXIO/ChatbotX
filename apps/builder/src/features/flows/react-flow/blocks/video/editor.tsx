'use client'

import { useFormContext } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone";

interface VideoBlockEditorProps {
  parentName: string
}

export function VideoBlockEditor({ parentName }: VideoBlockEditorProps) {
  const { register, unregister } = useFormContext()

  return <FileDropzone
    register={register}
    unregister={unregister}
    parentName={parentName}
    mode="link"
    type="video"
    configs={{
      uploadKeyName: 'common.uploadVideoOr',
      linkKeyName: 'common.insertLink',
      accept: {'video/*': []}
    }}
  />
}
