import { getAIFileExtensionsAccept } from "@chatbotx.io/ai/utils"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { getMimeTypeFromFile } from "@chatbotx.io/ui/lib/file-types"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { createAIFileAction } from "./actions/create-ai-file.action"

export function AIFilesCreate({ onSuccess }: { onSuccess?: () => void }) {
  const workspaceId = useWorkspaceId()

  const t = useTranslations()

  const { execute, isPending } = useAction(
    createAIFileAction.bind(null, workspaceId),
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
      accept={Object.values(getAIFileExtensionsAccept()).join(",")}
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
      uploadPath={`public/space/${workspaceId}/ai-files`}
    />
  )
}
