"use client"

import type { FileType } from "@aha.chat/database/types"
import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Input } from "@aha.chat/ui/components/ui/input"
import { DirectUploadButton } from "@aha.chat/ui/components/uploader/direct-upload-button"
import {
  FileIcon,
  ImageIcon,
  ImagePlayIcon,
  VideoIcon,
  Volume2Icon,
} from "lucide-react"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useRef } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"

export function DirectUploadOrInsertLink({
  parentName,
  fileType,
}: {
  parentName: string
  fileType: FileType
}) {
  const params = useParams<{ chatbotId: string; flowId: string }>()
  const t = useTranslations()

  const { setValue, getValues } = useFormContext()
  const uploadMode = getValues(`${parentName}.mode`)
  const publicUrl = getValues(`${parentName}.url`)
  const stepId = getValues(`${parentName}.id`)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const chooseInsertLink = () => {
    setValue(`${parentName}.mode`, "link")
  }

  const chooseUploadFile = () => {
    triggerRef.current?.click()
  }

  const fileConfigs = useMemo(() => {
    switch (fileType) {
      case "image":
        return {
          icon: ImageIcon,
          mimeType: "image/*",
        }
      case "gif":
        return {
          icon: ImagePlayIcon,
          mimeType: "image/gif",
        }
      case "video":
        return {
          icon: VideoIcon,
          mimeType: "video/*",
        }
      case "audio":
        return {
          icon: Volume2Icon,
          mimeType: "audio/*",
        }
      default:
        return {
          icon: FileIcon,
          mimeType: "application/*",
        }
    }
  }, [fileType])

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
            accept={fileConfigs.mimeType}
            className="hidden"
            maxSize={10_485_760} // 10MB
            multiple={false}
            onUploadError={(error, file) => {
              toast.error(`Failed to upload ${file.name}`, {
                description: error.message,
              })
            }}
            onUploadSuccess={(_filePath, _file, finalUrl) => {
              setValue(`${parentName}.url`, finalUrl)
            }}
            triggerRef={triggerRef}
            uploadPath={`public/chatbots/${params.chatbotId}/flows/${params.flowId}/steps/${stepId}`}
          />
          {publicUrl && publicUrl.length > 0 ? (
            <Button
              className="relative h-[150px] w-[240px] p-0!"
              onClick={chooseUploadFile}
              variant="ghost"
            >
              {fileType === "image" ? (
                <Image alt={stepId} fill={true} src={publicUrl} />
              ) : (
                <>
                  <fileConfigs.icon className="size-5" />
                  <span className="flex-1 truncate">{publicUrl}</span>
                </>
              )}
            </Button>
          ) : (
            <div className="flex w-full flex-col items-center justify-center">
              <fileConfigs.icon className="mt-2" size={24} />
              <div className="flex items-center justify-center gap-2">
                <Button
                  className="p-0 text-primary"
                  onClick={chooseUploadFile}
                  variant="link"
                >
                  {t("actions.uploadFile")}
                </Button>
                <span className="font-medium text-foreground text-sm">
                  {t("texts.or")}
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
          <fileConfigs.icon size={24} />
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
