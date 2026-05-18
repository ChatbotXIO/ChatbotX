"use client"

import { useParams } from "next/navigation"
import { useFormContext } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { ButtonGroupEditor } from "../button/editor"

type SendImageStepEditorProps = {
  parentName: string
}

const SendImageStepEditor = ({ parentName }: SendImageStepEditorProps) => {
  const params = useParams<{ workspaceId: string; flowId: string }>()
  const { getValues } = useFormContext()
  const stepId = getValues(`${parentName}.id`)

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2">
        <DirectUploadOrInsertLink
          fileType="image"
          parentName={parentName}
          uploadPath={`public/space/${params.workspaceId}/flows/${params.flowId}/steps/${stepId}`}
        />
      </div>
      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendImageStepEditor
