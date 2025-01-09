'use client'

import { useFormContext } from "react-hook-form"
import FileDropzone from "@/components/file-dropzone";

interface ImageBlockEditorProps {
  parentName: string
}

const ImageBlockEditor = ({ parentName }: ImageBlockEditorProps) => {
  const { register, unregister } = useFormContext()

  return <FileDropzone register={register} unregister={unregister} parentName={parentName} mode="link" />
}

export {
  ImageBlockEditor
}
