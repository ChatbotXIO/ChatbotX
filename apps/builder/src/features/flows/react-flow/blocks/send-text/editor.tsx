"use client"

import { InputWithEmoji } from "@/components/input-with-emoji"
import { useFormContext } from "react-hook-form"
import { ButtonGroupEditor } from "../button/editor"

const SendTextBlockEditor = ({ parentName }: { parentName: string }) => {
  const { register } = useFormContext();

  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <InputWithEmoji register={register} name={`${parentName}.message`} />
      <div className="bg-slate-200 p-4">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export {
  SendTextBlockEditor
}
