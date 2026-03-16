import { Loader2Icon, UploadIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { randomString } from "remeda"
import { toast } from "sonner"
import { getMimeTypeFromFile } from "../../lib/file-types"
import { Button } from "../ui/button"
import {
  FileUpload,
  FileUploadDropzone,
  type FileUploadProps,
  FileUploadTrigger,
} from "../ui/file-upload"

/**
 * Props for the DirectUploadButton component
 */
export type DirectUploadButtonProps = FileUploadProps & {
  /** The base path where files will be uploaded to S3 */
  uploadPath?: string
  /** Custom upload handler URL, defaults to /api/presigned-upload */
  uploadHandlerUrl?: string
  /** Callback when upload is successful, receives the uploaded file path and file object */
  onUploadSuccess?: (filePath: string, file: File, publicUrl: string) => void
  /** Callback when upload fails, receives the error and file object */
  onUploadError?: (error: Error, file: File) => void
  /** Reference to the trigger button */
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

/**
 * A file upload button component that handles presigned S3 uploads with progress tracking.
 *
 * @example
 * ```tsx
 * <DirectUploadButton
 *   uploadPath="public/chatbots/123/images"
 *   onUploadSuccess={(filePath, file) => {
 *     console.log(`File uploaded to: ${filePath}`)
 *   }}
 *   onUploadError={(error, file) => {
 *     console.error(`Failed to upload ${file.name}:`, error)
 *   }}
 * />
 * ```
 */
export function DirectUploadButton({
  uploadPath = "public/uploads",
  uploadHandlerUrl = "/api/presigned-upload",
  onUploadSuccess,
  onUploadError,
  triggerRef,
  label = "Upload File",
  ...props
}: DirectUploadButtonProps) {
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const onUpload: NonNullable<FileUploadProps["onUpload"]> = useCallback(
    async (choosenFiles, { onProgress, onSuccess, onError }) => {
      try {
        setIsUploading(true)

        // Process each file individually
        const uploadPromises = choosenFiles.map(async (file) => {
          try {
            const filePath = `${uploadPath}/${randomString(20)}${Date.now()}`

            const mimeType = getMimeTypeFromFile(file)

            // Step 1: Get presigned upload URL
            const presignedResponse = await fetch(uploadHandlerUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify([
                {
                  path: filePath,
                  name: file.name,
                  mimeType,
                },
              ]),
            })

            if (!presignedResponse.ok) {
              throw new Error(
                `Failed to get presigned URL: ${presignedResponse.statusText}`,
              )
            }

            const presignedData = await presignedResponse.json()
            const presignedPost = presignedData[0]

            // Upload with progress tracking
            const xhr = new XMLHttpRequest()

            return new Promise<void>((resolve, reject) => {
              xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                  const progress = (event.loaded / event.total) * 100
                  onProgress(file, progress)
                }
              })

              xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  onSuccess(file)
                  onUploadSuccess?.(filePath, file, presignedPost.publicUrl)
                  resolve()
                } else {
                  const error = new Error(
                    `Upload failed with status: ${xhr.status}`,
                  )
                  onError(file, error)
                  onUploadError?.(error, file)
                  reject(error)
                }
              })

              xhr.addEventListener("error", () => {
                const error = new Error("Upload failed due to network error")
                onError(file, error)
                onUploadError?.(error, file)
                reject(error)
              })

              xhr.addEventListener("abort", () => {
                const error = new Error("Upload was aborted")
                onError(file, error)
                onUploadError?.(error, file)
                reject(error)
              })

              xhr.open("PUT", presignedPost.presignedPostUrl)
              xhr.send(file)
            })
          } catch (error) {
            const uploadError =
              error instanceof Error ? error : new Error("Upload failed")
            onError(file, uploadError)
            onUploadError?.(uploadError, file)
          }
        })

        // Wait for all uploads to complete
        await Promise.all(uploadPromises)
      } catch (_error) {
        // This handles any error that might occur outside the individual upload processes
        toast.error("Upload failed", {
          description: "An unexpected error occurred during upload",
        })
      } finally {
        setIsUploading(false)
      }
    },
    [uploadPath, uploadHandlerUrl, onUploadSuccess, onUploadError],
  )

  const onFileReject = useCallback((file: File, message: string) => {
    toast(message, {
      description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}...` : file.name}" has been rejected`,
    })
  }, [])

  return (
    <FileUpload
      onFileReject={onFileReject}
      onUpload={onUpload}
      onValueChange={setFiles}
      value={files}
      {...props}
    >
      <FileUploadDropzone className="border-none p-0">
        <FileUploadTrigger asChild>
          <Button disabled={isUploading} ref={triggerRef}>
            {isUploading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon />
            )}
            {label}
          </Button>
        </FileUploadTrigger>
      </FileUploadDropzone>
    </FileUpload>
  )
}
