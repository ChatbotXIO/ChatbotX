"use client"

import { InputWithEmoji } from "@/components/input-with-emoji"
import { ButtonGroupEditor } from "../button/editor"

const SendTextStepEditor = ({ parentName }: { parentName: string }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <InputWithEmoji name={`${parentName}.message`} />
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendTextStepEditor
