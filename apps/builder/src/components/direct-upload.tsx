"use client"

import type { FileType } from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import {
  FileIcon,
  ImageIcon,
  ImagePlayIcon,
  VideoIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useMemo, useRef } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"

export function DirectUploadOrInsertLink({
  parentName,
  fileType,
  uploadPath,
}: {
  parentName: string
  fileType: FileType
  uploadPath: string
}) {
  const t = useTranslations()

  const { setValue, getValues } = useFormContext()
  const uploadMode = useWatch({ name: `${parentName}.mode` }) || "file"
  const publicUrl = useWatch({ name: `${parentName}.url` })
  const stepId = getValues(`${parentName}.id`)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const chooseInsertLink = () => {
    setValue(`${parentName}.mode`, "url")
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

  const clearInputFile = () => {
    setValue(`${parentName}.url`, "")
    setValue(`${parentName}.mode`, "file")
  }

  return (
    <div className="relative flex h-36 flex-col items-center justify-center">
      <FormFieldWrapper name={`${parentName}.mode`}>
        {(field) => <Input type="hidden" {...field} />}
      </FormFieldWrapper>

      <DirectUploadButton
        accept={fileConfigs.mimeType}
        className="hidden"
        label={t("actions.uploadFile")}
        maxSize={10_485_760} // 10MB
        multiple={false}
        onUploadError={(error, file) => {
          toast.error(`Failed to upload ${file.name}`, {
            description: error.message,
          })
        }}
        onUploadSuccess={(_filePath, _file, finalUrl) => {
          setValue(`${parentName}.url`, finalUrl)
          setValue(`${parentName}.mode`, "file")
        }}
        triggerRef={triggerRef}
        uploadPath={uploadPath}
      />

      {uploadMode === "file" ? (
        <>
          <FormFieldWrapper name={`${parentName}.url`}>
            {(field) => <Input type="hidden" {...field} />}
          </FormFieldWrapper>

          {publicUrl && publicUrl.length > 0 ? (
            <Button
              className="relative flex h-full w-full p-0!"
              onClick={chooseUploadFile}
              type="button"
              variant="ghost"
            >
              {fileType === "image" ? (
                <Image
                  alt={stepId}
                  fill={true}
                  objectFit="contain"
                  src={publicUrl}
                />
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
                  type="button"
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
                  type="button"
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
          {publicUrl.length ? (
            <Button
              className="h-full p-0!"
              onClick={chooseUploadFile}
              type="button"
              variant="ghost"
            >
              <Image
                alt={stepId}
                fill={true}
                objectFit="contain"
                src={publicUrl}
              />
            </Button>
          ) : (
            <>
              <fileConfigs.icon size={24} />
              <InputField
                className="flex-1"
                name={`${parentName}.url`}
                placeholder={t("fields.url.placeholder")}
              />
            </>
          )}
        </div>
      )}

      {publicUrl && (
        <div className="absolute top-0 right-0 z-1 size-6 rounded-full bg-white p-0 dark:bg-neutral-500!">
          <Button
            className="size-6 p-0!"
            onClick={clearInputFile}
            size="icon"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      )}
    </div>
  )
}
