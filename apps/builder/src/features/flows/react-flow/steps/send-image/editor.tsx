import { DirectUpload } from "@/components/direct-upload"
import { ButtonGroupEditor } from "../button/editor"

type SendImageStepEditorProps = {
  parentName: string
}

const SendImageStepEditor = (props: SendImageStepEditorProps) => {
  const { parentName } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <DirectUpload parentName={parentName} />
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export { SendImageStepEditor }
