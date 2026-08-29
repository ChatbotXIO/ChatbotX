"use client"

import type { FileType } from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
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
import { useMemo, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { UrlVariablePicker } from "@/components/direct-upload"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"

export function MediaLibraryOrInsertLink({
  parentName,
  fileType,
  uploadPath,
  showVariablePicker = false,
  includeBotFieldVariables = false,
}: {
  parentName: string
  fileType: FileType
  uploadPath?: string
  // Requires a mounted CustomFieldStoreProvider (e.g. inside the flow editor).
  showVariablePicker?: boolean
  // See `UrlVariablePicker`'s doc — only opt in when this URL field is
  // actually resolved against contact/bot-field variables at send time.
  includeBotFieldVariables?: boolean
}) {
  const params = useParams<{ workspaceId: string }>()
  const t = useTranslations()

  const { control, setValue, getValues } = useFormContext()
  const [uploadMode, setUploadMode] = useState(getValues(`${parentName}.mode`))
  const publicUrl = useWatch({ control, name: `${parentName}.url` })
  const stepId = useWatch({ control, name: `${parentName}.id` })

  const chooseInsertLink = () => {
    setValue(`${parentName}.mode`, "url")
    setUploadMode("url")
  }

  const insertUrlVariable = (variableName: string) => {
    const currentUrl = getValues(`${parentName}.url`) || ""
    setValue(`${parentName}.url`, `${currentUrl}{{${variableName}}}`, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const fileConfigs = useMemo(() => {
    switch (fileType) {
      case "image":
        return { icon: ImageIcon, mimeType: "image/*" }
      case "gif":
        return { icon: ImagePlayIcon, mimeType: "image/gif" }
      case "video":
        return { icon: VideoIcon, mimeType: "video/*" }
      case "audio":
        return { icon: Volume2Icon, mimeType: "audio/*" }
      default:
        return { icon: FileIcon, mimeType: "application/*" }
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

          {publicUrl && publicUrl.length > 0 ? (
            <MediaLibraryTrigger
              onSelect={(file) => {
                setValue(`${parentName}.url`, file.url, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }}
              uploadPath={uploadPath}
              workspaceId={params.workspaceId}
            >
              <Button
                className="relative h-37.5 w-60 overflow-hidden p-0!"
                type="button"
                variant="ghost"
              >
                {fileType === "image" ? (
                  <Image
                    alt={stepId ?? ""}
                    className="object-cover"
                    fill={true}
                    sizes="240px"
                    src={publicUrl}
                  />
                ) : (
                  <>
                    <fileConfigs.icon className="size-5" />
                    <span className="flex-1 truncate">{publicUrl}</span>
                  </>
                )}
              </Button>
            </MediaLibraryTrigger>
          ) : (
            <div className="flex w-full flex-col items-center justify-center">
              <fileConfigs.icon className="mt-2" size={24} />
              <div className="flex items-center justify-center gap-2">
                <MediaLibraryTrigger
                  onSelect={(file) => {
                    setValue(`${parentName}.url`, file.url, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }}
                  uploadPath={uploadPath}
                  workspaceId={params.workspaceId}
                >
                  <Button
                    className="p-0 text-primary"
                    type="button"
                    variant="link"
                  >
                    {t("mediaLibrary.openMediaLibrary")}
                  </Button>
                </MediaLibraryTrigger>
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
          <fileConfigs.icon size={24} />
          <InputField
            className="flex-1"
            name={`${parentName}.url`}
            placeholder={t("fields.url.placeholder")}
          />
          {showVariablePicker && (
            <UrlVariablePicker
              includeBotFieldVariables={includeBotFieldVariables}
              onSelect={insertUrlVariable}
            />
          )}
        </div>
      )}
    </>
  )
}
