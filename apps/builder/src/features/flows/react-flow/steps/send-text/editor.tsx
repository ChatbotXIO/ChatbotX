"use client"

import { InputWithEmoji } from "@/components/input-with-emoji"
import { ButtonGroupEditor } from "../button/editor"

type SendTextStepEditorProps = {
  parentName: string
}

const SendTextStepEditor = (props: SendTextStepEditorProps) => {
  const { parentName } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <InputWithEmoji name={`${parentName}.message`} />
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendTextStepEditor
