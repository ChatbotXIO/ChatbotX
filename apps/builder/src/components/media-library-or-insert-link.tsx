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
import { useFormContext } from "react-hook-form"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"

export function MediaLibraryOrInsertLink({
  parentName,
  fileType,
}: {
  parentName: string
  fileType: FileType
}) {
  const params = useParams<{ workspaceId: string }>()
  const t = useTranslations()

  const { setValue, getValues } = useFormContext()
  const [uploadMode, setUploadMode] = useState(getValues(`${parentName}.mode`))
  const publicUrl = getValues(`${parentName}.url`)
  const stepId = getValues(`${parentName}.id`)

  const chooseInsertLink = () => {
    setValue(`${parentName}.mode`, "link")
    setUploadMode("link")
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
                setValue(`${parentName}.url`, file.url)
              }}
              workspaceId={params.workspaceId}
            >
              <Button
                className="relative h-[150px] w-[240px] p-0!"
                type="button"
                variant="ghost"
              >
                {fileType === "image" ? (
                  <Image alt={stepId ?? ""} fill={true} src={publicUrl} />
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
                    setValue(`${parentName}.url`, file.url)
                  }}
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
        </div>
      )}
    </>
  )
}
