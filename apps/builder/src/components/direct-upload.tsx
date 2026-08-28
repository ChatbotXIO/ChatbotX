"use client"

import type { FileType } from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import {
  CodeXml,
  FileIcon,
  ImageIcon,
  ImagePlayIcon,
  VideoIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useMemo, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { usePromptVariableOptions } from "@/components/tiptap/use-prompt-variable-options"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useWorkspaceId } from "@/hooks/routing"

// next/image's built-in optimizer rejects SVGs unless `dangerouslyAllowSVG`
// is enabled (a global CSP trade-off we don't want just for this preview),
// so render SVG preview sources unoptimized instead — safe since <img>/<Image>
// never executes embedded scripts.
const SVG_URL_PATTERN = /\.svg(?:$|\?)/i
const isSvgUrl = (url: string) => SVG_URL_PATTERN.test(url)

export function UrlVariablePicker({
  onSelect,
}: {
  onSelect: (variableName: string) => void
}) {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)
  const promptVariableOptions = usePromptVariableOptions({})

  if (promptVariableOptions.length === 0) {
    return null
  }

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("actions.addVariable")}
            size="icon"
            title={t("actions.addVariable")}
            type="button"
            variant="outline"
          >
            <CodeXml className="size-4" />
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0">
        <div className="max-h-60 w-50 overflow-y-auto">
          {promptVariableOptions.map((field, index) => {
            const showGroup =
              Boolean(field.group) &&
              promptVariableOptions[index - 1]?.group !== field.group

            return (
              <div key={field.value}>
                {showGroup ? (
                  <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs">
                    {field.group}
                  </div>
                ) : null}
                <Button
                  className="w-full cursor-pointer justify-start rounded-none p-2"
                  onClick={() => {
                    onSelect(field.value)
                    setIsOpen(false)
                  }}
                  variant="ghost"
                >
                  {field.label}
                </Button>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DirectUploadOrInsertLink({
  parentName,
  fileType,
  uploadPath,
  onSuccess,
  showVariablePicker = false,
  useMediaLibrary = false,
}: {
  parentName: string
  fileType: FileType
  uploadPath: string
  onSuccess?: (url: string) => void
  // Requires a mounted CustomFieldStoreProvider (e.g. inside the flow editor).
  showVariablePicker?: boolean
  // Pick an existing workspace file from the Media Library instead of only
  // uploading a new one from the device.
  useMediaLibrary?: boolean
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const { setValue, getValues, control } = useFormContext()
  const uploadMode = useWatch({ control, name: `${parentName}.mode` }) || "file"
  const publicUrl = useWatch({ control, name: `${parentName}.url` }) || ""
  const stepId = getValues(`${parentName}.id`)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const chooseInsertLink = () => {
    setValue(`${parentName}.mode`, "url", {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const chooseUploadFile = () => {
    triggerRef.current?.click()
  }

  const handleMediaLibrarySelect = (file: { url: string }) => {
    if (onSuccess) {
      onSuccess(file.url)
    } else {
      setValue(`${parentName}.url`, file.url, {
        shouldValidate: true,
        shouldDirty: true,
      })
      setValue(`${parentName}.mode`, "file", {
        shouldValidate: true,
        shouldDirty: true,
      })
    }
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

  const insertUrlVariable = (variableName: string) => {
    const currentUrl = getValues(`${parentName}.url`) || ""
    setValue(`${parentName}.url`, `${currentUrl}{{${variableName}}}`, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const clearInputFile = () => {
    setValue(`${parentName}.url`, "", {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue(`${parentName}.mode`, "file", {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  return (
    <div className="relative flex h-36 flex-col items-center justify-center">
      <FormFieldWrapper name={`${parentName}.mode`}>
        {(field) => <Input type="hidden" {...field} />}
      </FormFieldWrapper>

      {!useMediaLibrary && (
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
            setValue(`${parentName}.url`, finalUrl, {
              shouldValidate: true,
              shouldDirty: true,
            })
            setValue(`${parentName}.mode`, "file", {
              shouldValidate: true,
              shouldDirty: true,
            })
          }}
          triggerRef={triggerRef}
          uploadPath={uploadPath}
          workspaceId={workspaceId}
        />
      )}

      {uploadMode === "file" ? (
        <>
          <FormFieldWrapper name={`${parentName}.url`}>
            {(field) => <Input type="hidden" {...field} />}
          </FormFieldWrapper>

          {!useMediaLibrary && (
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
                if (onSuccess) {
                  onSuccess(finalUrl)
                } else {
                  setValue(`${parentName}.url`, finalUrl, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              }}
              triggerRef={triggerRef}
              uploadPath={uploadPath}
              workspaceId={workspaceId}
            />
          )}
          {publicUrl && publicUrl.length > 0 ? (
            (() => {
              const thumbnailContent =
                fileType === "image" ? (
                  <Image
                    alt={stepId ?? ""}
                    className="object-contain"
                    fill={true}
                    sizes="240px"
                    src={publicUrl}
                    unoptimized={isSvgUrl(publicUrl)}
                  />
                ) : (
                  <div className="flex w-full min-w-0 items-center gap-2 px-3">
                    <fileConfigs.icon className="size-5 flex-none" />
                    <span className="min-w-0 flex-1 truncate text-start">
                      {publicUrl}
                    </span>
                  </div>
                )
              const thumbnailButton = (
                <Button
                  className="relative flex h-full w-full overflow-hidden p-0!"
                  onClick={useMediaLibrary ? undefined : chooseUploadFile}
                  type="button"
                  variant="ghost"
                >
                  {thumbnailContent}
                </Button>
              )
              return useMediaLibrary ? (
                <MediaLibraryTrigger
                  onSelect={handleMediaLibrarySelect}
                  uploadPath={uploadPath}
                  workspaceId={workspaceId}
                >
                  {thumbnailButton}
                </MediaLibraryTrigger>
              ) : (
                thumbnailButton
              )
            })()
          ) : (
            <div className="flex w-full flex-col items-center justify-center">
              <fileConfigs.icon className="mt-2" size={24} />
              <div className="flex items-center justify-center gap-2">
                {useMediaLibrary ? (
                  <MediaLibraryTrigger
                    onSelect={handleMediaLibrarySelect}
                    uploadPath={uploadPath}
                    workspaceId={workspaceId}
                  >
                    <Button
                      className="p-0 text-primary"
                      type="button"
                      variant="link"
                    >
                      {t("actions.uploadFile")}
                    </Button>
                  </MediaLibraryTrigger>
                ) : (
                  <Button
                    className="p-0 text-primary"
                    onClick={chooseUploadFile}
                    type="button"
                    variant="link"
                  >
                    {t("actions.uploadFile")}
                  </Button>
                )}
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
            <UrlVariablePicker onSelect={insertUrlVariable} />
          )}
          {onSuccess && (
            <Button
              disabled={!publicUrl}
              onClick={() => {
                if (publicUrl) {
                  onSuccess(publicUrl)
                  setValue(`${parentName}.url`, "", {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                  setValue(`${parentName}.mode`, "file", {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              }}
              size="sm"
              type="button"
            >
              {t("actions.add")}
            </Button>
          )}
        </div>
      )}

      {publicUrl && (
        <div className="absolute inset-e-2 top-0 z-1 size-6 rounded-full bg-white p-0 dark:bg-neutral-500!">
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
