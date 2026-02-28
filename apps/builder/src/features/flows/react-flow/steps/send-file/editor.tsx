import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { ButtonGroupEditor } from "../button/editor"

type SendFileStepEditorProps = {
  parentName: string
}

const SendFileStepEditor = (props: SendFileStepEditorProps) => {
  const { parentName } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2 pt-3">
        <DirectUploadOrInsertLink fileType="file" parentName={parentName} />
      </div>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendFileStepEditor
