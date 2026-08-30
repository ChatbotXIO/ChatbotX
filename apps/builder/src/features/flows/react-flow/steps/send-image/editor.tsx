import { MediaLibraryOrInsertLink } from "@/components/media-library-or-insert-link"
import { ButtonGroupEditor } from "../button/editor"

type SendImageStepEditorProps = {
  parentName: string
}

const SendImageStepEditor = ({ parentName }: SendImageStepEditorProps) => (
  <div className="items-center justify-center overflow-hidden rounded-lg">
    <div className="bg-secondary px-4 py-2">
      <MediaLibraryOrInsertLink fileType="image" parentName={parentName} />
    </div>
    <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
      <ButtonGroupEditor parentName={`${parentName}.buttons`} />
    </div>
  </div>
)

export default SendImageStepEditor
