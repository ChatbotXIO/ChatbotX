"use client"

import { InputWithEmoji } from "@/components/input-with-emoji"
import { ButtonGroupEditor } from "../button/editor"

const SendTextBlockEditor = ({ parentName }: { parentName: string }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <InputWithEmoji name={`${parentName}.message`} />
      <div className="bg-slate-200 p-4">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export { SendTextBlockEditor }
