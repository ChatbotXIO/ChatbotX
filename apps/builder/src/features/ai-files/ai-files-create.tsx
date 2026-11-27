"use client"

import { getAllowableKnowledgeExtensions } from "@chatbotx.io/ai"
import { AI_FILE_MAX_UPLOAD_BYTES } from "@chatbotx.io/sdk"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { getMimeTypeFromFile } from "@chatbotx.io/ui/lib/file-types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { createAIFileAction } from "./actions/create-ai-file.action"
import { createAIFileFromUrlAction } from "./actions/create-ai-file-from-url.action"
import { createAIFileFromUrlRequest } from "./schema"

type CreateResult = { processingRunError: string | null } | undefined

export function AIFilesCreate({ onSuccess }: { onSuccess?: () => void }) {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const feature = t("fields.aiFile.label")

  const handleCreated = (data: CreateResult) => {
    if (data?.processingRunError === "enqueueFailed") {
      toast.warning(t("aiFiles.processingRun.error.enqueueFailed"))
    } else {
      toast.success(t("messages.createdSuccess", { feature }))
    }
    setOpen(false)
    onSuccess?.()
  }

  const handleFailed = (serverError: string | undefined) => {
    toast.error(serverError ?? t("messages.createdFailed", { feature }))
  }

  const upload = useAction(createAIFileAction.bind(null, workspaceId), {
    onSuccess: ({ data }) => handleCreated(data),
    onError: ({ error }) => handleFailed(error.serverError),
  })

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAIFileFromUrlAction.bind(null, workspaceId),
      zodResolver(createAIFileFromUrlRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            resetFormAndAction()
            handleCreated(data)
          },
          onError: ({ error }) => handleFailed(error.serverError),
        },
        formProps: {
          mode: "onChange",
          defaultValues: { name: "", url: "" },
        },
        errorMapProps: {},
      },
    )

  const urlPending = form.formState.isSubmitting

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            {t("aiFiles.create.trigger")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("aiFiles.create.title")}</DialogTitle>
          <DialogDescription>
            {t("aiFiles.create.description")}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="upload">
          <TabsList className="w-full">
            <TabsTrigger value="upload">{t("actions.uploadFile")}</TabsTrigger>
            <TabsTrigger value="url">
              {t("aiFiles.create.tabs.fromUrl")}
            </TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="upload">
            <DirectUploadButton
              accept={getAllowableKnowledgeExtensions()}
              disabled={upload.isPending}
              label={t("actions.uploadFile")}
              maxSize={AI_FILE_MAX_UPLOAD_BYTES}
              multiple={false}
              onUploadError={(error, file) => {
                toast.error(
                  t("aiFiles.create.uploadFailed", { name: file.name }),
                  {
                    description: error.message,
                  },
                )
              }}
              onUploadSuccess={(filePath, file) => {
                upload.execute({
                  name: file.name,
                  path: filePath,
                  mimeType: getMimeTypeFromFile(file),
                  size: file.size,
                })
              }}
              uploadPath={`workspaces/${workspaceId}/ai-files`}
              workspaceId={workspaceId}
            />
          </TabsContent>
          <TabsContent className="mt-4" value="url">
            <Form {...form}>
              <form className="space-y-4" onSubmit={handleSubmitWithAction}>
                <InputField
                  label={t("fields.name.label")}
                  name="name"
                  placeholder={t("fields.name.placeholder")}
                  required
                />
                <InputField
                  description={t("aiFiles.create.urlHelp")}
                  descriptionType="tooltip"
                  label={t("fields.url.label")}
                  name="url"
                  placeholder={t("fields.url.placeholder")}
                  required
                  type="url"
                />
                <p className="text-muted-foreground text-xs">
                  {t("aiFiles.create.snapshotNotice")}
                </p>
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button type="button" variant="ghost">
                        {t("actions.cancel")}
                      </Button>
                    }
                  />
                  <Button
                    disabled={!form.formState.isValid || urlPending}
                    type="submit"
                  >
                    {urlPending && <Loader2Icon className="animate-spin" />}
                    {t("actions.add")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
