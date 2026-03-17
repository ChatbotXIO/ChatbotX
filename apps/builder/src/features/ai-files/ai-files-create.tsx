import { DirectUploadButton } from "@aha.chat/ui/components/uploader/direct-upload-button"
import { getMimeTypeFromFile } from "@aha.chat/ui/lib/file-types"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { createAIFileAction } from "./actions/create-ai-file.action"
import { getAIFileExtensionsAccept } from "./constants"

export function AIFilesCreate({ onSuccess }: { onSuccess?: () => void }) {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()

  const { execute, isPending } = useAction(
    createAIFileAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.createdSuccess", {
            feature: t("fields.aiFile.label"),
          }),
        )
        onSuccess?.()
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
      accept={getAIFileExtensionsAccept()}
      disabled={isPending}
      label={t("actions.uploadFile")}
      maxSize={26_214_400} // 25MB
      multiple={false}
      onUploadError={(error, file) => {
        toast.error(`Failed to upload ${file.name}`, {
          description: error.message,
        })
      }}
      onUploadSuccess={(filePath, file) => {
        const mimeType = getMimeTypeFromFile(file)

        execute({
          name: file.name,
          path: filePath,
          mimeType,
          size: file.size,
        })
      }}
      uploadPath={`public/chatbots/${chatbotId}/ai-files`}
    />
  )
}
