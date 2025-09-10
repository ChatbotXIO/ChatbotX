import { FILE_CONFIGS, FILE_SIZE_LIMITS, FILE_TYPE_GROUPS, getFileConfigByMimeType, type FileTypeString } from "./file-config"

/**
 * Utility functions for file handling and validation
 */

export type FileValidationOptions = {
  /** Maximum file size in bytes */
  maxSize?: number
  /** Allowed MIME types */
  allowedTypes?: string[]
  /** Maximum number of files */
  maxFiles?: number
}

export type FileValidationResult = {
  isValid: boolean
  errors: string[]
}

/**
 * Validates a single file against the provided options
 */
export function validateFile(file: File, options: FileValidationOptions = {}): FileValidationResult {
  const errors: string[] = []
  const { maxSize = FILE_SIZE_LIMITS.DEFAULT, allowedTypes = [] } = options

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File "${file.name}" is too large. Maximum size is ${formatFileSize(maxSize)}.`)
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.some(type => file.type.match(type))) {
    errors.push(`File "${file.name}" has an invalid type. Allowed types: ${allowedTypes.join(", ")}.`)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Validates multiple files against the provided options
 */
export function validateFiles(files: File[], options: FileValidationOptions = {}): FileValidationResult {
  const errors: string[] = []
  const { maxFiles = 10 } = options

  // Check number of files
  if (files.length > maxFiles) {
    errors.push(`Too many files. Maximum allowed is ${maxFiles}.`)
  }

  // Validate each file
  for (const file of files) {
    const result = validateFile(file, options)
    errors.push(...result.errors)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Formats file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Gets file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2)
}

/**
 * Checks if file is an image based on MIME type
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/")
}

/**
 * Checks if file is a video based on MIME type
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/")
}

/**
 * Checks if file is an audio based on MIME type
 */
export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/")
}

/**
 * Checks if file is a document based on MIME type
 */
export function isDocumentFile(file: File): boolean {
  return file.type.startsWith("application/") ||
    file.type === "text/plain" ||
    file.type === "text/csv"
}

/**
 * Gets file type category based on MIME type
 */
export function getFileTypeCategory(file: File): "image" | "video" | "audio" | "document" | "other" {
  if (isImageFile(file)) return "image"
  if (isVideoFile(file)) return "video"
  if (isAudioFile(file)) return "audio"
  if (isDocumentFile(file)) return "document"
  return "other"
}

/**
 * Creates a preview URL for a file (for images/videos)
 */
export function createFilePreview(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Revokes a preview URL to free up memory
 */
export function revokeFilePreview(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * Reads file content as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsText(file)
  })
}

/**
 * Reads file content as data URL (base64)
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

/**
 * Reads file content as ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Gets image dimensions from a file
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error("File is not an image"))
      return
    }

    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      revokeFilePreview(img.src)
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = createFilePreview(file)
  })
}

/**
 * Compresses an image file (client-side)
 */
export function compressImage(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    outputFormat?: string
  } = {}
): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error("File is not an image"))
      return
    }

    const { maxWidth = 1920, maxHeight = 1080, quality = 0.8, outputFormat = "image/jpeg" } = options

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width *= ratio
        height *= ratio
      }

      canvas.width = width
      canvas.height = height

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: outputFormat,
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          } else {
            reject(new Error("Failed to compress image"))
          }
          revokeFilePreview(img.src)
        },
        outputFormat,
        quality
      )
    }

    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = createFilePreview(file)
  })
}

/**
 * Get file type from MIME type
 */
export function getFileTypeFromMimeType(mimeType: string): FileTypeString | null {
  const config = getFileConfigByMimeType(mimeType)
  if (!config) return null

  // Find the file type that matches this config
  for (const [fileType, fileConfig] of Object.entries(FILE_CONFIGS)) {
    if (fileConfig === config) {
      return fileType as FileTypeString
    }
  }
  return null
}

/**
 * Get file type category from MIME type
 */
export function getFileTypeCategoryFromMimeType(mimeType: string): "image" | "video" | "audio" | "document" | "other" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  if (mimeType.startsWith("application/") || mimeType === "text/plain" || mimeType === "text/csv") return "document"
  return "other"
}

/**
 * Check if file type is supported by the application
 */
export function isFileTypeSupported(mimeType: string): boolean {
  return getFileConfigByMimeType(mimeType) !== null
}

/**
 * Get validation options for a specific file type group
 */
export function getValidationOptionsForGroup(
  group: keyof typeof FILE_TYPE_GROUPS,
  maxSize: number = FILE_SIZE_LIMITS.DEFAULT,
  maxFiles: number = 10
): FileValidationOptions {
  return {
    maxSize,
    maxFiles,
    allowedTypes: FILE_TYPE_GROUPS[group],
  }
}

/**
 * Get human-readable file type description
 */
export function getFileTypeDescription(mimeType: string): string {
  const config = getFileConfigByMimeType(mimeType)
  return config?.description ?? "Unknown file type"
}

/**
 * Get file type label
 */
export function getFileTypeLabel(mimeType: string): string {
  const config = getFileConfigByMimeType(mimeType)
  return config?.label ?? "File"
}
