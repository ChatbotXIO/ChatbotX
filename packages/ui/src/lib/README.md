# File Utilities and Configuration

This directory contains centralized file handling utilities and configuration that can be reused across the entire application.

## Files

### `file-config.ts`
Centralized configuration for file types, size limits, and validation groups.

**Features:**
- File type configurations with icons, MIME types, and descriptions
- Standardized file size limits
- File type groups for validation
- Helper functions for file type operations

**Usage:**
```tsx
import { 
  FILE_SIZE_LIMITS, 
  FILE_TYPE_GROUPS, 
  getFileConfig,
  getFileConfigByMimeType 
} from "@aha.chat/ui/lib/file-config"

// Use predefined size limits
const maxSize = FILE_SIZE_LIMITS.DEFAULT // 5MB

// Use predefined file type groups
const allowedTypes = FILE_TYPE_GROUPS.IMAGES // ["image/*"]

// Get file configuration
const config = getFileConfig("IMAGE")
```

### `file-utils.ts`
Comprehensive utility functions for file handling and validation.

**Features:**
- File validation (size, type, count)
- File type detection and categorization
- File size formatting
- Image compression
- File reading utilities (text, data URL, ArrayBuffer)
- Preview URL management
- Image dimension extraction

**Usage:**
```tsx
import { 
  validateFiles, 
  formatFileSize, 
  isImageFile, 
  compressImage,
  getImageDimensions,
  getFileTypeFromMimeType
} from "@aha.chat/ui/lib/file-utils"

// Validate files
const result = validateFiles(files, {
  maxSize: FILE_SIZE_LIMITS.DEFAULT,
  maxFiles: 10,
  allowedTypes: FILE_TYPE_GROUPS.IMAGES
})

// Format file size
const sizeText = formatFileSize(1024 * 1024) // "1 MB"

// Check file type
const isImage = isImageFile(file)

// Compress image
const compressedFile = await compressImage(file, {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.8
})
```

### `upload.ts`
Core upload functionality with retry logic and progress tracking.

**Features:**
- Presigned URL generation
- File upload with progress tracking
- Retry mechanism with exponential backoff
- Error handling

**Usage:**
```tsx
import { 
  getPresignedUrl, 
  uploadSingleFile, 
  retryWithBackoff 
} from "@aha.chat/ui/lib/upload"

// Get presigned URL
const presignedPost = await getPresignedUrl({
  file,
  filePath: "public/uploads/file.jpg",
  uploadHandlerUrl: "/api/presigned-upload"
})

// Upload file
await uploadSingleFile(file, presignedPost, filePath, {
  onProgress: (file, progress) => console.log(`${progress}%`),
  onSuccess: (file) => console.log("Uploaded"),
  onError: (file, error) => console.error(error)
})
```

## Migration from Scattered Constants

The following constants and configurations were centralized:

### From `apps/builder/src/components/direct-upload.tsx`:
- `FILE_CONFIGS` → Moved to `file-config.ts`
- `MAX_FILE_SIZE` → Replaced with `FILE_SIZE_LIMITS.DEFAULT`

### From `apps/builder/src/features/messages/schemas/create-message.schema.ts`:
- `MAX_FILE_SIZE` → Replaced with `FILE_SIZE_LIMITS.DEFAULT`

### From `apps/builder/src/features/messages/components/chat-input.tsx`:
- File size constants → Replaced with `FILE_SIZE_LIMITS.DEFAULT`
- File type arrays → Replaced with `FILE_TYPE_GROUPS.ALL`

## Benefits

1. **Centralized Configuration**: All file-related constants and configurations are in one place
2. **Consistency**: Standardized file size limits and type groups across the application
3. **Reusability**: Utilities can be easily imported and used in any component
4. **Type Safety**: Full TypeScript support with proper type definitions
5. **Maintainability**: Changes to file handling logic only need to be made in one place
6. **Documentation**: Well-documented functions with JSDoc comments
7. **Flexibility**: Generic types that work with different FileType enums

## Integration

To use these utilities in any component:

```tsx
// Import from the main UI package
import { 
  FILE_SIZE_LIMITS, 
  FILE_TYPE_GROUPS,
  validateFiles,
  formatFileSize 
} from "@aha.chat/ui"

// Or import from specific files
import { getFileConfig } from "@aha.chat/ui/lib/file-config"
import { compressImage } from "@aha.chat/ui/lib/file-utils"
```

## Type Compatibility

The utilities are designed to work with different FileType enums:

- **Database FileType**: Used in components that interact with the database
- **UI FileTypeString**: Used internally by the UI utilities
- **Mapping Functions**: Convert between different FileType representations

This approach ensures compatibility while maintaining type safety and avoiding circular dependencies.
