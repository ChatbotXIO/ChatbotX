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
/** Extra metadata a success callback gets alongside the S3 key — the `File` row id (ownership proof for a later server-side read-back) and the resolved MIME type sent to the presign endpoint. */
export type DirectUploadSuccessMeta = {
  fileId: string
  mimeType: string
}

export type DirectUploadButtonProps = FileUploadProps & {
  /** Workspace ID for the upload. Omit for platform-level (workspace-less) uploads. */
  workspaceId?: string
  /** The base path where files will be uploaded to S3 */
  uploadPath?: string
  /** Custom upload handler URL, defaults to /api/presigned-upload */
  uploadHandlerUrl?: string
  /** `type` sent to the presign endpoint — selects the server-side path/authz handler (`getUploadHandler`). Defaults to `"generic"`. */
  uploadType?: string
  /** `subType` sent to the presign endpoint — persisted on the `File` row for later ownership checks. Defaults to `"generic"`. */
  uploadSubType?: string
  /** Callback when upload is successful, receives the uploaded file path, file object, public URL, and the minted `File` row id + resolved MIME type. */
  onUploadSuccess?: (
    filePath: string,
    file: File,
    publicUrl: string,
    meta: DirectUploadSuccessMeta,
  ) => void
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
 *   uploadPath="public/space/123/images"
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
  workspaceId,
  uploadPath = "public/uploads",
  uploadHandlerUrl = "/api/presigned-upload",
  uploadType = "generic",
  uploadSubType = "generic",
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
              body: JSON.stringify({
                path: filePath,
                ...(workspaceId !== undefined && { workspaceId }),
                fileName: file.name,
                type: uploadType,
                subType: uploadSubType,
                mimeType,
              }),
            })

            if (!presignedResponse.ok) {
              const errorBody = await presignedResponse.json().catch(() => null)
              throw new Error(
                `Failed to get presigned URL: ${errorBody?.error ?? presignedResponse.statusText}`,
              )
            }

            const presignedPost = await presignedResponse.json()

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
                  onUploadSuccess?.(
                    presignedPost.path,
                    file,
                    presignedPost.publicUrl,
                    { fileId: presignedPost.fileId, mimeType },
                  )
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
      } catch {
        // This handles any error that might occur outside the individual upload processes
        toast.error("Upload failed", {
          description: "An unexpected error occurred during upload",
        })
      } finally {
        setIsUploading(false)
        setFiles([])
      }
    },
    [
      workspaceId,
      uploadPath,
      uploadHandlerUrl,
      uploadType,
      uploadSubType,
      onUploadSuccess,
      onUploadError,
    ],
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
        <FileUploadTrigger
          render={
            <Button disabled={isUploading} ref={triggerRef} type="button">
              {isUploading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <UploadIcon />
              )}
              {label}
            </Button>
          }
        />
      </FileUploadDropzone>
    </FileUpload>
  )
}
