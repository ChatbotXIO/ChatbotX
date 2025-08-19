"use client"

import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadTrigger,
} from "@aha.chat/ui/components/ui/file-upload"
import { Input } from "@aha.chat/ui/components/ui/input"
import ky from "ky"
import { ImageIcon, Upload } from "lucide-react"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useCallback } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"

export function DirectUpload({ parentName }: { parentName: string }) {
  const params = useParams<{ chatbotId: string; flowId: string }>()

  const { setValue, getValues } = useFormContext()
  const uploadMode = getValues(`${parentName}.imageMode`)
  const publicUrl = getValues(`${parentName}.url`)
  const stepId = getValues(`${parentName}.id`)

  const onUpload = useCallback(
    async (
      files: File[],
      {
        onProgress,
        onSuccess,
        onError,
      }: {
        onProgress: (file: File, progress: number) => void
        onSuccess: (file: File) => void
        onError: (file: File, error: Error) => void
      },
    ) => {
      try {
        // Process each file individually
        const uploadPromises = files.map(async (file) => {
          try {
            // Simulate file upload with progress
            const totalChunks = 10
            let uploadedChunks = 0

            for (let i = 0; i < totalChunks; i++) {
              // Update progress for this specific file
              uploadedChunks++
              const progress = (uploadedChunks / totalChunks) * 100
              onProgress(file, progress)
            }

            const presignedPost = await ky
              .post<
                {
                  url: string
                  fields: Record<string, string>[]
                  publicUrl: string
                }[]
              >("/api/presigned-upload", {
                json: [
                  {
                    fileType: file.type,
                    fileName: file.name,
                    filePathProps: {
                      chatbotId: params.chatbotId,
                      flowId: params.flowId,
                      stepId,
                    },
                  },
                ],
              })
              .json()

            const formData = new FormData()
            for (const field in presignedPost[0].fields) {
              if (Object.hasOwn(presignedPost[0].fields, field)) {
                formData.append(field, String(presignedPost[0].fields[field]))
              }
            }
            formData.append("file", file)

            await fetch(presignedPost[0].url, {
              method: "POST",
              body: formData,
            })

            setValue(`${parentName}.url`, presignedPost[0].publicUrl)
            onSuccess(file)
          } catch (error) {
            onError(
              file,
              error instanceof Error ? error : new Error("Upload failed"),
            )
          }
        })

        // Wait for all uploads to complete
        await Promise.all(uploadPromises)
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: wip
        console.error(error)
      }
    },
    [parentName, stepId, params, setValue],
  )

  const onFileReject = useCallback((file: File, message: string) => {
    toast(message, {
      description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}...` : file.name}" has been rejected`,
    })
  }, [])

  return (
    <>
      <FormFieldWrapper name={`${parentName}.imageMode`}>
        {(field) => <Input type="hidden" {...field} />}
      </FormFieldWrapper>
      {uploadMode === "file" ? (
        <FormFieldWrapper name={`${parentName}.url`}>
          {(field) => (
            <FileUpload
              accept="image/*"
              maxFiles={1}
              onFileReject={onFileReject}
              onUpload={onUpload}
              onValueChange={field.onChange}
              value={field.value}
            >
              <FileUploadDropzone className="rounded-b-none border-b-0">
                {publicUrl ? (
                  <Image alt={stepId} src={publicUrl} />
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center justify-center rounded-full border p-2.5">
                        <Upload className="size-6 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex w-full items-center gap-1">
                      <FileUploadTrigger asChild>
                        <Button
                          className="w-fit underline"
                          size="sm"
                          variant="ghost"
                        >
                          Upload image
                        </Button>
                      </FileUploadTrigger>
                      <div className="w-4">or</div>
                      <Button
                        className="w-fit underline"
                        onClick={(e) => {
                          e.preventDefault()
                          setValue(`${parentName}.imageMode`, "link")
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Insert Link
                      </Button>
                    </div>
                  </>
                )}
              </FileUploadDropzone>
            </FileUpload>
          )}
        </FormFieldWrapper>
      ) : (
        <div className="flex w-full items-center gap-2 rounded-t-lg border-2 border-b-0 border-dashed p-2">
          <ImageIcon />
          <InputField
            className="flex-1"
            name={`${parentName}.url`}
            placeholder="Enter image URL"
          />
        </div>
      )}
    </>
  )
}
