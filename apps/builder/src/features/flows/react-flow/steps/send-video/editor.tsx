import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { ButtonGroupEditor } from "../button/editor"

type SendVideoStepEditorProps = {
  parentName: string
}

const SendVideoStepEditor = (props: SendVideoStepEditorProps) => {
  const { parentName } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2 pt-3">
        <DirectUploadOrInsertLink fileType="video" parentName={parentName} />
      </div>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendVideoStepEditor
