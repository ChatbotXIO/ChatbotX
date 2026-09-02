"use client"

import {
  buildMessagingAdCreativeStoragePrefix,
  MAX_MESSAGING_AD_IMAGE_BYTES,
  MESSAGING_AD_CREATIVE_UPLOAD_KIND,
  MESSAGING_AD_IMAGE_MIME_ALLOWLIST,
  messagingAdConfigByChannel,
} from "@chatbotx.io/integration-facebook-ads"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { Loader2Icon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { WelcomeMessageEditor } from "./welcome-message-editor"
import type {
  WizardFormValues,
  WizardMessagingAdChannel,
} from "./wizard-form-schema"

type Props = {
  workspaceId: string
  channel: WizardMessagingAdChannel
  integrationId: string
}

const VIDEO_POLL_INTERVAL_MS = 4000
const MAX_VIDEO_POLL_ATTEMPTS = 45 // ~3 minutes

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function CreativeStep({ workspaceId, channel, integrationId }: Props) {
  const t = useTranslations()
  const { control, setValue, formState } = useFormContext<WizardFormValues>()
  const adAccountId = useWatch({ control, name: "adAccountId" })
  const mediaKind = useWatch({ control, name: "mediaKind" })
  const imagePreviewUrl = useWatch({ control, name: "imagePreviewUrl" })
  const videoReady = useWatch({ control, name: "videoReady" })
  const [isUploading, setIsUploading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const pollAttempts = useRef(0)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const config = messagingAdConfigByChannel[channel]

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [])

  // Presigned S3 upload (browser -> our storage directly) — no bytes transit
  // the builder server, and no Meta call happens at wizard time. Only the S3
  // key + the minted `File` row id are stored in form state; the Meta
  // `image_hash` is derived transiently at create time from the stored
  // object (see `resolveStoredImageBytes` in `@chatbotx.io/business`).
  const handleImageUploadSuccess = useCallback(
    (
      path: string,
      file: File,
      _publicUrl: string,
      meta: { fileId: string; mimeType: string },
    ) => {
      const previewUrl = URL.createObjectURL(file)
      setValue("mediaKind", "image", { shouldValidate: true })
      setValue("imageKey", path, { shouldValidate: true })
      setValue("fileId", meta.fileId, { shouldValidate: true })
      setValue("imageMimeType", meta.mimeType)
      setValue("imageFileName", file.name)
      setValue("imagePreviewUrl", previewUrl)
    },
    [setValue],
  )

  const handleImageUploadError = useCallback(() => {
    toast.error(t("adsCampaign.creative.imageUploadFailed"))
  }, [t])

  const pollVideoStatus = useCallback(
    async (videoId: string) => {
      setIsPolling(true)
      pollAttempts.current = 0
      const poll = async (): Promise<void> => {
        if (!isMountedRef.current) {
          return
        }
        pollAttempts.current += 1
        const status = await client.adsCampaignAPI.getAdVideoStatus({
          workspaceId,
          channel,
          integrationId,
          videoId,
        })
        if (!isMountedRef.current) {
          return
        }
        if (status.isReady) {
          setIsPolling(false)
          setValue("videoReady", true, { shouldValidate: true })
          return
        }
        if (status.isError || pollAttempts.current >= MAX_VIDEO_POLL_ATTEMPTS) {
          setIsPolling(false)
          toast.error(t("adsCampaign.creative.videoProcessingFailed"))
          return
        }
        pollTimeoutRef.current = setTimeout(poll, VIDEO_POLL_INTERVAL_MS)
      }
      await poll()
    },
    [channel, integrationId, setValue, t, workspaceId],
  )

  const handleVideoUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!(file && adAccountId)) {
        return
      }
      setIsUploading(true)
      try {
        const base64 = await readFileAsBase64(file)
        const result = await client.adsCampaignAPI.uploadAdVideo({
          workspaceId,
          channel,
          integrationId,
          adAccountId,
          fileName: file.name,
          mimeType: file.type,
          base64,
        })
        setValue("mediaKind", "video", { shouldValidate: true })
        setValue("videoId", result.videoId, { shouldValidate: true })
        setValue("videoReady", false, { shouldValidate: true })
        setIsUploading(false)
        await pollVideoStatus(result.videoId)
      } catch (error) {
        setIsUploading(false)
        toast.error(
          error instanceof Error ? error.message : t("messages.error"),
        )
      }
    },
    [
      adAccountId,
      channel,
      integrationId,
      pollVideoStatus,
      setValue,
      t,
      workspaceId,
    ],
  )

  useEffect(
    () => () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
    },
    [imagePreviewUrl],
  )

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("adsCampaign.creative.mediaType.label")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <DirectUploadButton
              accept={MESSAGING_AD_IMAGE_MIME_ALLOWLIST.join(",")}
              disabled={!adAccountId}
              label={t("adsCampaign.creative.mediaType.uploadImage")}
              maxSize={MAX_MESSAGING_AD_IMAGE_BYTES}
              multiple={false}
              onUploadError={handleImageUploadError}
              onUploadSuccess={handleImageUploadSuccess}
              uploadPath={buildMessagingAdCreativeStoragePrefix(workspaceId)}
              uploadSubType={MESSAGING_AD_CREATIVE_UPLOAD_KIND}
              uploadType={MESSAGING_AD_CREATIVE_UPLOAD_KIND}
              workspaceId={workspaceId}
            />
            <Button
              disabled={!adAccountId || isUploading}
              // Renders a <label> (wrapping the hidden file input), not a native
              // <button> — tell Base UI so it drops native-button semantics.
              nativeButton={false}
              render={
                <label>
                  <UploadIcon className="size-3.5" />
                  {t("adsCampaign.creative.mediaType.uploadVideo")}
                  <input
                    accept="video/mp4"
                    className="sr-only"
                    disabled={!adAccountId}
                    onChange={handleVideoUpload}
                    type="file"
                  />
                </label>
              }
              type="button"
              variant="outline"
            />
          </div>
          {!adAccountId && (
            <p className="text-destructive text-xs">
              {t("adsCampaign.creative.mediaType.selectAdAccountFirst")}
            </p>
          )}
          {formState.errors.mediaKind && (
            <p className="text-destructive text-xs">
              {t("adsCampaign.creative.mediaRequired")}
            </p>
          )}
          {(isUploading || isPolling) && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2Icon className="size-3.5 animate-spin" />
              {isPolling
                ? t("adsCampaign.creative.videoProcessing")
                : t("adsCampaign.creative.uploading")}
            </div>
          )}
        </div>

        {mediaKind === "image" && (
          <div className="space-y-3">
            {imagePreviewUrl && (
              // biome-ignore lint/performance/noImgElement: local blob preview, not a remote/optimizable asset
              <img
                alt={t("adsCampaign.creative.previewAlt")}
                className="h-32 w-auto rounded-md border object-cover"
                height={128}
                src={imagePreviewUrl}
                width={128}
              />
            )}
            <InputField
              label={t("fields.url.label")}
              name="imageLink"
              required
            />
            <InputField
              label={t("adsCampaign.creative.primaryText")}
              maxLength={500}
              name="imageMessage"
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField
                label={t("adsCampaign.creative.headline")}
                maxLength={40}
                name="imageHeadline"
              />
              <InputField
                label={t("fields.description.label")}
                maxLength={200}
                name="imageDescription"
              />
            </div>
          </div>
        )}

        {mediaKind === "video" && (
          <div className="space-y-3">
            <Badge variant={videoReady ? "default" : "secondary"}>
              {videoReady
                ? t("adsCampaign.creative.videoReady")
                : t("adsCampaign.creative.videoProcessing")}
            </Badge>
            <InputField
              label={t("adsCampaign.creative.headline")}
              maxLength={40}
              name="videoTitle"
            />
            <InputField
              label={t("adsCampaign.creative.primaryText")}
              maxLength={500}
              name="videoMessage"
            />
            <InputField
              label={t("fields.description.label")}
              maxLength={200}
              name="videoLinkDescription"
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-sm">
          {t("adsCampaign.welcomeMessage.title")}
        </h4>
        <WelcomeMessageEditor />
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-sm">
          {t("adsCampaign.fields.callToAction.label")}
        </h4>
        <p className="text-muted-foreground text-sm">
          {t("adsCampaign.fields.callToAction.derivedNote", {
            type: config.ctaType,
          })}
        </p>
      </div>
    </div>
  )
}
