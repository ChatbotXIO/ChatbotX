"use client"

import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useStepStore } from "../../stores/step-store-provider"
import { ButtonGroupEditor } from "../button/editor"

type SendTextStepEditorProps = {
  parentName: string
}

const SendTextStepEditor = (props: SendTextStepEditorProps) => {
  const { parentName } = props
  const { customFieldOptions } = useStepStore((state) => state)

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2">
        <TiptapEditorField
          customFields={customFieldOptions}
          name={`${parentName}.message`}
        />
      </div>

      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendTextStepEditor
