import {
  type UseFileUploadOptions,
  useFileUpload,
} from "@aha.chat/ui/hooks/use-file-upload"
import {
  FILE_SIZE_LIMITS,
  FILE_TYPE_GROUPS,
} from "@aha.chat/ui/lib/file-config"
import {
  type FileValidationOptions,
  validateFiles,
} from "@aha.chat/ui/lib/file-utils"
import { useCallback, useState } from "react"
import { toast } from "sonner"

export type UseChatFileUploadOptions = Omit<
  UseFileUploadOptions,
  "onUploadSuccess" | "onUploadError"
> & {
  /** Callback when upload is successful */
  onUploadSuccess?: (filePath: string, file: File, publicUrl: string) => Promise<void>
  /** Callback when upload fails */
  onUploadError?: (error: Error, file: File) => void
  /** File validation options */
  validation?: FileValidationOptions
  /** Upload path for chat files */
  uploadPath?: string
}

export type UseChatFileUploadReturn = {
  /** Files currently selected/uploading */
  files: File[]
  /** Whether upload is in progress */
  isUploading: boolean
  /** Upload progress for each file */
  uploadProgress: Record<string, number>
  /** Number of active uploads */
  activeUploadCount: number
  /** Upload handler function */
  onUpload: (files: File[]) => Promise<void>
  /** File rejection handler */
  onFileReject: (file: File, message: string) => void
  /** Update files list */
  setFiles: (files: File[]) => void
  /** Clear all files */
  clearFiles: () => void
  /** Abort all ongoing uploads */
  abortUploads: () => void
  /** Validate files before upload */
  validateFiles: (files: File[]) => boolean
}

const DEFAULT_VALIDATION: FileValidationOptions = {
  maxSize: FILE_SIZE_LIMITS.DEFAULT,
  maxFiles: 1,
  allowedTypes: FILE_TYPE_GROUPS.ALL,
}

/**
 * Custom hook for handling file uploads in chat context.
 * Provides validation, progress tracking, and error handling specific to chat messages.
 *
 * @example
 * ```tsx
 * const {
 *   files,
 *   isUploading,
 *   onUpload,
 *   onFileReject,
 *   setFiles,
 *   clearFiles
 * } = useChatFileUpload({
 *   uploadPath: "public/conversations/123",
 *   onUploadSuccess: (filePath, file, publicUrl) => {
 *     // Handle successful upload
 *   },
 *   validation: {
 *     maxSize: 10 * 1024 * 1024, // 10MB
 *     maxFiles: 5
 *   }
 * })
 * ```
 */
export function useChatFileUpload({
  uploadPath = "public/conversations",
  validation = DEFAULT_VALIDATION,
  onUploadSuccess,
  onUploadError,
  ...options
}: UseChatFileUploadOptions = {}): UseChatFileUploadReturn {
  const [files, setFiles] = useState<File[]>([])

  const handleUploadSuccess = useCallback(
    async (filePath: string, file: File, publicUrl: string) => {
      // toast.success("File uploaded successfully", {
      //   description: `"${file.name}" has been uploaded`,
      // })
      await onUploadSuccess?.(filePath, file, publicUrl)
    },
    [onUploadSuccess],
  )

  const handleUploadError = useCallback(
    (error: Error, file: File) => {
      toast.error("Upload failed", {
        description: `Failed to upload "${file.name}": ${error.message}`,
      })
      onUploadError?.(error, file)
    },
    [onUploadError],
  )

  const {
    isUploading,
    uploadProgress,
    activeUploadCount,
    onUpload: baseOnUpload,
    onFileReject: baseOnFileReject,
    setFiles: baseSetFiles,
    abortUploads,
  } = useFileUpload({
    uploadPath,
    onUploadSuccess: handleUploadSuccess,
    onUploadError: handleUploadError,
    ...options,
  })

  const validateFilesForUpload = useCallback(
    (filesToValidate: File[]): boolean => {
      const result = validateFiles(filesToValidate, validation)

      if (!result.isValid) {
        for (const error of result.errors) {
          toast.error("File validation failed", {
            description: error,
          })
        }
        return false
      }

      return true
    },
    [validation],
  )

  const onUpload = useCallback(
    async (filesToUpload: File[]) => {
      if (!validateFilesForUpload(filesToUpload)) {
        return
      }

      setFiles(filesToUpload)
      await baseOnUpload(filesToUpload, {
        onProgress: () => {
          // Progress is handled by the base hook
        },
        onSuccess: () => {
          // Success is handled by the base hook
        },
        onError: () => {
          // Error is handled by the base hook
        },
      })
    },
    [validateFilesForUpload, baseOnUpload],
  )

  const onFileReject = useCallback(
    (file: File, message: string) => {
      toast.error("File rejected", {
        description: `"${file.name}": ${message}`,
      })
      baseOnFileReject(file, message)
    },
    [baseOnFileReject],
  )

  const setFilesWithValidation = useCallback(
    (newFiles: File[]) => {
      if (validateFilesForUpload(newFiles)) {
        setFiles(newFiles)
        baseSetFiles(newFiles)
      }
    },
    [validateFilesForUpload, baseSetFiles],
  )

  const clearFiles = useCallback(() => {
    setFiles([])
    baseSetFiles([])
  }, [baseSetFiles])

  return {
    files,
    isUploading,
    uploadProgress,
    activeUploadCount,
    onUpload,
    onFileReject,
    setFiles: setFilesWithValidation,
    clearFiles,
    abortUploads,
    validateFiles: validateFilesForUpload,
  }
}
