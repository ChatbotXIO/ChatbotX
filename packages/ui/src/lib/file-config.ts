import {
  FileIcon,
  ImageIcon,
  ImagePlayIcon,
  VideoIcon,
  Volume2Icon,
} from "lucide-react"

// Generic file type string for configuration
export type FileTypeString = "IMAGE" | "GIF" | "VIDEO" | "AUDIO" | "DOCUMENT"

/**
 * File configuration for different file types
 */
export type FileConfig = {
  icon: typeof ImageIcon
  mimeType: string
  label: string
  description?: string
}

/**
 * Configuration for different file types with icons and MIME types
 */
export const FILE_CONFIGS: Record<FileTypeString, FileConfig> = {
  IMAGE: {
    icon: ImageIcon,
    mimeType: "image/*",
    label: "Image",
    description: "JPEG, PNG, WebP, GIF images",
  },
  GIF: {
    icon: ImagePlayIcon,
    mimeType: "image/gif",
    label: "GIF",
    description: "Animated GIF images",
  },
  VIDEO: {
    icon: VideoIcon,
    mimeType: "video/*",
    label: "Video",
    description: "MP4, WebM, MOV video files",
  },
  AUDIO: {
    icon: Volume2Icon,
    mimeType: "audio/*",
    label: "Audio",
    description: "MP3, WAV, OGG audio files",
  },
  DOCUMENT: {
    icon: FileIcon,
    mimeType: "application/*",
    label: "Document",
    description: "PDF, DOC, TXT, and other documents",
  },
} as const

/**
 * Default file size limits
 */
export const FILE_SIZE_LIMITS = {
  /** Default maximum file size: 5MB */
  DEFAULT: 5 * 1024 * 1024,
  /** Small file size limit: 1MB */
  SMALL: 1 * 1024 * 1024,
  /** Medium file size limit: 10MB */
  MEDIUM: 10 * 1024 * 1024,
  /** Large file size limit: 50MB */
  LARGE: 50 * 1024 * 1024,
  /** Extra large file size limit: 100MB */
  EXTRA_LARGE: 100 * 1024 * 1024,
} as const

/**
 * Common file type groups for validation
 */
export const FILE_TYPE_GROUPS = {
  /** All image types */
  IMAGES: ["image/*"] as string[],
  /** All video types */
  VIDEOS: ["video/*"] as string[],
  /** All audio types */
  AUDIO: ["audio/*"] as string[],
  /** Common document types */
  DOCUMENTS: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/csv",
  ] as string[],
  /** All media types (images, videos, audio) */
  MEDIA: ["image/*", "video/*", "audio/*"] as string[],
  /** All supported types */
  ALL: ["image/*", "video/*", "audio/*", "application/*", "text/*"] as string[],
}

/**
 * Get file configuration for a specific file type
 */
export function getFileConfig(fileType: FileTypeString): FileConfig {
  return FILE_CONFIGS[fileType] ?? FILE_CONFIGS.DOCUMENT
}

/**
 * Get file configuration based on MIME type
 */
export function getFileConfigByMimeType(mimeType: string): FileConfig | null {
  for (const [fileType, config] of Object.entries(FILE_CONFIGS)) {
    if (mimeType.match(config.mimeType)) {
      return config
    }
  }
  return null
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(fileType: FileTypeString): boolean {
  return fileType in FILE_CONFIGS
}

/**
 * Get all supported file types
 */
export function getSupportedFileTypes(): FileTypeString[] {
  return Object.keys(FILE_CONFIGS) as FileTypeString[]
}

/**
 * Get MIME types for a file type group
 */
export function getMimeTypesForGroup(group: keyof typeof FILE_TYPE_GROUPS): string[] {
  return FILE_TYPE_GROUPS[group]
}
