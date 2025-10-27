import { DirectUploadButton } from "@aha.chat/ui/components/uploader/direct-upload-button"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { createAiFileAction } from "./actions/create-ai-file.action"

export function AIFilesCreate() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    createAiFileAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.createSuccess", {
            feature: t("fields.aiFile.label"),
          }),
        )
      },
      onError: (_error) => {
        toast.error(
          t("messages.createdFailed", {
            feature: t("fields.aiFile.label"),
          }),
        )
      },
    },
  )

  return (
    <DirectUploadButton
      accept=".pdf,.md,.docx,.txt,.csv,.xlsx"
      disabled={isPending}
      maxSize={25_000_000} // 25MB
      multiple={false}
      onUploadError={(error, file) => {
        toast.error(`Failed to upload ${file.name}`, {
          description: error.message,
        })
      }}
      onUploadSuccess={(filePath, file) => {
        execute({
          name: file.name,
          path: filePath,
          mimeType: file.type,
          size: file.size,
        })
      }}
      uploadPath={`public/chatbots/${chatbotId}/ai-files`}
    />
  )
}
