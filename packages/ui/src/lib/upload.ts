import { randomString } from "remeda"
import type { FileUploadProps } from "../components/ui/file-upload"

type GetPresignedUrlParams = {
  file: File
  filePath: string
  uploadHandlerUrl?: string
  retryConfig?: { maxRetries: number, retryDelay: number }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  retryDelay: number,
  retries: number = maxRetries,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      const delay = retryDelay * (maxRetries - retries + 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return retryWithBackoff(fn, maxRetries, retryDelay, retries - 1)
    }
    throw error
  }
}

// Generate unique file path for upload
export function generateFilePath(uploadPath: string) {
  return `${uploadPath}/${randomString(20)}_${Date.now()}`
}

// Upload single file with progress tracking
export async function getPresignedUrl({ file, filePath, uploadHandlerUrl = "/api/presigned-upload", retryConfig = { maxRetries: 3, retryDelay: 1000 } }: GetPresignedUrlParams) {
  return retryWithBackoff(
    async () => {
      const response = await fetch(uploadHandlerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            path: filePath,
            name: file.name,
            mimeType: file.type,
          },
        ]),
      })

      if (!response.ok) {
        throw new Error(`Failed to get presigned URL: ${response.statusText}`)
      }

      const data = await response.json()
      return data[0]
    },
    retryConfig.maxRetries,
    retryConfig.retryDelay,
  )
}

export async function uploadSingleFile(
  file: File,
  presignedPost: { presignedPostUrl: string; publicUrl: string },
  filePath: string,
  { onProgress, onSuccess, onError }: Parameters<NonNullable<FileUploadProps["onUpload"]>>[1],
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100
        onProgress(file, progress)
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onSuccess(file)
        resolve()
      } else {
        const error = new Error(`Upload failed with status: ${xhr.status}`)
        onError(file, error)
        reject(error)
      }
    })

    xhr.addEventListener("error", () => {
      const error = new Error("Upload failed due to network error")
      onError(file, error)
      reject(error)
    })

    xhr.addEventListener("abort", () => {
      const error = new Error("Upload was aborted")
      onError(file, error)
      reject(error)
    })

    xhr.open("PUT", presignedPost.presignedPostUrl)
    xhr.send(file)
  })
}