"use client"

import { FileType } from "@aha.chat/database/types"
import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Input } from "@aha.chat/ui/components/ui/input"
import { DirectUploadButton } from "@aha.chat/ui/components/uploader/direct-upload-button"
import {
  FILE_SIZE_LIMITS,
  type FileTypeString,
  getFileConfig,
} from "@aha.chat/ui/lib/file-config"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo, useRef } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"

type DirectUploadOrInsertLinkProps = {
  parentName: string
  fileType: FileType
}

// Map database FileType to UI FileTypeString
function mapFileTypeToUI(fileType: FileType): FileTypeString {
  switch (fileType) {
    case FileType.IMAGE:
      return "IMAGE"
    case FileType.GIF:
      return "GIF"
    case FileType.VIDEO:
      return "VIDEO"
    case FileType.AUDIO:
      return "AUDIO"
    case FileType.DOCUMENT:
      return "DOCUMENT"
    default:
      return "DOCUMENT"
  }
}

export function DirectUploadOrInsertLink({
  parentName,
  fileType,
}: DirectUploadOrInsertLinkProps) {
  const params = useParams<{ chatbotId: string; flowId: string }>()
  const t = useTranslations()

  const { setValue, getValues } = useFormContext()
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // Memoize form values to prevent unnecessary re-renders
  const formValues = useMemo(() => {
    const mode = getValues(`${parentName}.mode`)
    const url = getValues(`${parentName}.url`)
    const stepId = getValues(`${parentName}.id`)
    return { mode, url, stepId }
  }, [getValues, parentName])

  const fileConfig = useMemo(() => {
    return getFileConfig(mapFileTypeToUI(fileType))
  }, [fileType])

  const uploadPath = useMemo(() => {
    return `public/chatbots/${params.chatbotId}/flows/${params.flowId}/steps/${formValues.stepId}`
  }, [params.chatbotId, params.flowId, formValues.stepId])

  const chooseInsertLink = useCallback(() => {
    setValue(`${parentName}.mode`, "link")
  }, [setValue, parentName])

  const chooseUploadFile = useCallback(() => {
    triggerRef.current?.click()
  }, [])

  const handleUploadError = useCallback((error: Error, file: File) => {
    toast.error(`Failed to upload ${file.name}`, {
      description: error.message || "An unexpected error occurred",
    })
  }, [])

  const handleUploadSuccess = useCallback(
    (_filePath: string, _file: File, finalUrl: string) => {
      setValue(`${parentName}.url`, finalUrl)
    },
    [setValue, parentName],
  )

  const { mode: uploadMode, url: publicUrl, stepId: currentStepId } = formValues
  const IconComponent = fileConfig.icon

  // Check if URL is valid and not empty
  const hasValidUrl = publicUrl && publicUrl.trim().length > 0

  return (
    <>
      <FormFieldWrapper name={`${parentName}.mode`}>
        {(field) => <Input type="hidden" {...field} />}
      </FormFieldWrapper>

      {uploadMode === "file" ? (
        <>
          <FormFieldWrapper name={`${parentName}.url`}>
            {(field) => <Input type="hidden" {...field} />}
          </FormFieldWrapper>

          <DirectUploadButton
            accept={fileConfig.mimeType}
            className="hidden"
            maxSize={FILE_SIZE_LIMITS.DEFAULT}
            multiple={false}
            onUploadError={handleUploadError}
            onUploadSuccess={handleUploadSuccess}
            triggerRef={triggerRef}
            uploadPath={uploadPath}
          />

          {hasValidUrl ? (
            <Button
              className="!p-0 relative h-[150px] w-[240px]"
              onClick={chooseUploadFile}
              variant="ghost"
            >
              {fileType === FileType.IMAGE ? (
                <Image
                  alt={`Uploaded file for step ${currentStepId}`}
                  fill
                  src={publicUrl}
                />
              ) : (
                <>
                  <IconComponent className="size-5" />
                  <span className="flex-1 truncate">{publicUrl}</span>
                </>
              )}
            </Button>
          ) : (
            <div className="flex w-full flex-col items-center justify-center">
              <IconComponent className="mt-2" size={24} />
              <div className="flex items-center justify-center gap-2">
                <Button
                  className="p-0 text-primary"
                  onClick={chooseUploadFile}
                  variant="link"
                >
                  {t("actions.uploadFile")}
                </Button>
                <span className="font-medium text-foreground text-sm">
                  {t("messages.or")}
                </span>
                <Button
                  className="p-0 text-primary"
                  onClick={chooseInsertLink}
                  variant="link"
                >
                  {t("actions.insertLink")}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex w-full items-center gap-2 py-2">
          <IconComponent size={24} />
          <InputField
            className="flex-1"
            name={`${parentName}.url`}
            placeholder={t("fields.url.placeholder")}
          />
        </div>
      )}
    </>
  )
}
