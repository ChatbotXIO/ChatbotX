"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { getPresignedUrl, uploadSingleFile, generateFilePath } from "../lib/upload"
import type { FileUploadProps } from "../components/ui/file-upload"

export type UseFileUploadOptions = {
  /** The base path where files will be uploaded to S3 */
  uploadPath?: string
  /** Custom upload handler URL, defaults to /api/presigned-upload */
  uploadHandlerUrl?: string
  /** Callback when upload is successful, receives the uploaded file path and file object */
  onUploadSuccess?: (filePath: string, file: File, publicUrl: string) => void
  /** Callback when upload fails, receives the error and file object */
  onUploadError?: (error: Error, file: File) => void
  /** Maximum number of concurrent uploads */
  maxConcurrentUploads?: number
  /** Custom retry configuration */
  retryConfig?: {
    maxRetries: number
    retryDelay: number
  }
}

export type UseFileUploadReturn = {
  /** Files currently being uploaded or queued */
  files: File[]
  /** Whether upload is in progress */
  isUploading: boolean
  /** Upload progress for each file */
  uploadProgress: Record<string, number>
  /** Number of active uploads */
  activeUploadCount: number
  /** Upload handler function */
  onUpload: NonNullable<FileUploadProps["onUpload"]>
  /** File rejection handler */
  onFileReject: (file: File, message: string) => void
  /** Update files list */
  setFiles: (files: File[]) => void
  /** Abort all ongoing uploads */
  abortUploads: () => void
}

/**
 * Custom hook for handling file uploads with progress tracking and concurrency control.
 * 
 * @example
 * ```tsx
 * const {
 *   files,
 *   isUploading,
 *   uploadProgress,
 *   onUpload,
 *   onFileReject,
 *   setFiles
 * } = useFileUpload({
 *   uploadPath: "public/chatbots/123/images",
 *   onUploadSuccess: (filePath, file, publicUrl) => {
 *     console.log(`File uploaded to: ${filePath}`)
 *   },
 *   onUploadError: (error, file) => {
 *     console.error(`Failed to upload ${file.name}:`, error)
 *   }
 * })
 * ```
 */
export function useFileUpload({
  uploadPath = "public/uploads",
  uploadHandlerUrl = "/api/presigned-upload",
  onUploadSuccess,
  onUploadError,
  maxConcurrentUploads = 3,
  retryConfig = { maxRetries: 3, retryDelay: 1000 },
}: UseFileUploadOptions = {}): UseFileUploadReturn {
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const activeUploadsRef = useRef<Set<string>>(new Set())
  const abortControllerRef = useRef<AbortController | null>(null)

  // Generate unique file path
  const generateUniqueFilePath = useCallback(
    (file: File) => `${generateFilePath(uploadPath)}_${file.name}`,
    [uploadPath],
  )

  // Upload single file with progress tracking
  const uploadSingleFileWithProgress = useCallback(
    async (
      file: File,
      presignedPost: { presignedPostUrl: string; publicUrl: string },
      filePath: string,
      { onProgress, onSuccess, onError }: Parameters<NonNullable<FileUploadProps["onUpload"]>>[1],
    ) => {
      const fileId = `${file.name}_${file.size}_${file.lastModified}`

      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        // Track active uploads
        activeUploadsRef.current.add(fileId)

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100
            setUploadProgress(prev => ({ ...prev, [fileId]: progress }))
            onProgress(file, progress)
          }
        })

        xhr.addEventListener("load", () => {
          activeUploadsRef.current.delete(fileId)
          setUploadProgress(prev => {
            const { [fileId]: _, ...rest } = prev
            return rest
          })

          if (xhr.status >= 200 && xhr.status < 300) {
            onSuccess(file)
            onUploadSuccess?.(filePath, file, presignedPost.publicUrl)
            resolve()
          } else {
            const error = new Error(`Upload failed with status: ${xhr.status}`)
            onError(file, error)
            onUploadError?.(error, file)
            reject(error)
          }
        })

        xhr.addEventListener("error", () => {
          activeUploadsRef.current.delete(fileId)
          setUploadProgress(prev => {
            const { [fileId]: _, ...rest } = prev
            return rest
          })
          const error = new Error("Upload failed due to network error")
          onError(file, error)
          onUploadError?.(error, file)
          reject(error)
        })

        xhr.addEventListener("abort", () => {
          activeUploadsRef.current.delete(fileId)
          setUploadProgress(prev => {
            const { [fileId]: _, ...rest } = prev
            return rest
          })
          const error = new Error("Upload was aborted")
          onError(file, error)
          onUploadError?.(error, file)
          reject(error)
        })

        xhr.open("PUT", presignedPost.presignedPostUrl)
        xhr.send(file)
      })
    },
    [onUploadSuccess, onUploadError],
  )

  // Process files with concurrency control
  const processFilesWithConcurrency = useCallback(
    async (
      filesToUpload: File[],
      { onProgress, onSuccess, onError }: Parameters<NonNullable<FileUploadProps["onUpload"]>>[1],
    ) => {
      const results: Promise<void>[] = []
      const semaphore = new Array(maxConcurrentUploads).fill(null)
      let fileIndex = 0

      const processNextFile = async (): Promise<void> => {
        if (fileIndex >= filesToUpload.length) return

        const file = filesToUpload[fileIndex++]
        const filePath = generateUniqueFilePath(file)

        try {
          const presignedPost = await getPresignedUrl({
            file,
            filePath,
            uploadHandlerUrl,
            retryConfig
          })
          await uploadSingleFileWithProgress(file, presignedPost, filePath, {
            onProgress,
            onSuccess,
            onError,
          })
        } catch (error) {
          const uploadError = error instanceof Error ? error : new Error("Upload failed")
          onError(file, uploadError)
          onUploadError?.(uploadError, file)
        }
      }

      // Start initial batch
      for (let i = 0; i < Math.min(maxConcurrentUploads, filesToUpload.length); i++) {
        results.push(processNextFile())
      }

      // Process remaining files as slots become available
      while (fileIndex < filesToUpload.length) {
        await Promise.race(results.filter(Boolean))
        results.push(processNextFile())
      }

      await Promise.all(results)
    },
    [maxConcurrentUploads, generateUniqueFilePath, uploadHandlerUrl, retryConfig, uploadSingleFileWithProgress, onUploadError],
  )

  const onUpload: NonNullable<FileUploadProps["onUpload"]> = useCallback(
    async (chosenFiles, callbacks) => {
      try {
        setIsUploading(true)
        setUploadProgress({})

        // Create new abort controller for this upload session
        abortControllerRef.current = new AbortController()

        await processFilesWithConcurrency(chosenFiles, callbacks)
      } catch (error) {
        console.error("Upload process failed:", error)
        toast.error("Upload failed", {
          description: error instanceof Error ? error.message : "An unexpected error occurred",
        })
      } finally {
        setIsUploading(false)
        setUploadProgress({})
        abortControllerRef.current = null
      }
    },
    [processFilesWithConcurrency],
  )

  const onFileReject = useCallback((file: File, message: string) => {
    toast.error(message, {
      description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}...` : file.name}" has been rejected`,
    })
  }, [])

  const abortUploads = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    activeUploadsRef.current.clear()
    setUploadProgress({})
  }, [])

  return {
    files,
    isUploading,
    uploadProgress,
    activeUploadCount: activeUploadsRef.current.size,
    onUpload,
    onFileReject,
    setFiles,
    abortUploads,
  }
}
