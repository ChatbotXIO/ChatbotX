import { DirectUploadButton } from "@aha.chat/ui/components/uploader/direct-upload-button"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { createAIFileAction } from "./actions/create-ai-file.action"

export function AIFilesCreate() {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    createAIFileAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.createdSuccess", {
            feature: t("fields.aiFile.label"),
          }),
        )
        router.refresh()
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
      maxSize={26_214_400} // 25MB
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
