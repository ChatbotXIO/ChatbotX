"use client"

import FileDropzone from "@/components/file-dropzone"
import { useFormContext } from "react-hook-form"
import { ButtonGroupEditor } from "../button/editor"

const SendImageBlockEditor = ({ parentName }: { parentName: string }) => {
  const { register, unregister } = useFormContext()

  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <FileDropzone
        register={register}
        unregister={unregister}
        parentName={parentName}
        mode="link"
      />
      <div className="bg-slate-200 p-4">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export { SendImageBlockEditor }
