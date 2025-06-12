import { ButtonGroupEditor } from "../button/editor"
import { DirectUpload } from "@/components/direct-upload"

const SendImageStepEditor = ({ parentName }: { parentName: string }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <DirectUpload parentName={parentName} />
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export { SendImageStepEditor }
