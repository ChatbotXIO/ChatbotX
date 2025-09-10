# File Upload Hooks and Utilities

This directory contains reusable file upload functionality extracted from the chat input component.

## Files Created

### 1. `use-chat-file-upload.ts`
A specialized hook for handling file uploads in chat context. Provides validation, progress tracking, and error handling specific to chat messages.

**Features:**
- File validation with customizable rules
- Progress tracking for uploads
- Error handling with toast notifications
- Concurrency control for multiple uploads
- Automatic cleanup of preview URLs

**Usage:**
```tsx
import { useChatFileUpload } from "../hooks/use-chat-file-upload"

const {
  files,
  isUploading,
  onUpload,
  onFileReject,
  setFiles,
  clearFiles,
  validateFiles
} = useChatFileUpload({
  uploadPath: "public/conversations/123",
  validation: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    allowedTypes: ["image/*", "video/*", "audio/*"]
  },
  onUploadSuccess: (filePath, file, publicUrl) => {
    // Handle successful upload
  }
})
```

### 2. `packages/ui/src/hooks/use-file-upload.ts`
A generic file upload hook that can be used across the application.

**Features:**
- Generic file upload functionality
- Progress tracking
- Concurrency control
- Retry mechanism with exponential backoff
- Abort functionality

**Usage:**
```tsx
import { useFileUpload } from "@aha.chat/ui/hooks/use-file-upload"

const {
  files,
  isUploading,
  uploadProgress,
  onUpload,
  onFileReject,
  setFiles,
  abortUploads
} = useFileUpload({
  uploadPath: "public/uploads",
  maxConcurrentUploads: 3,
  retryConfig: { maxRetries: 3, retryDelay: 1000 }
})
```

### 3. `packages/ui/src/lib/file-utils.ts`
Utility functions for file handling and validation.

**Features:**
- File validation (size, type, count)
- File type detection
- File size formatting
- Image compression
- File reading utilities
- Preview URL management

**Usage:**
```tsx
import { 
  validateFiles, 
  formatFileSize, 
  isImageFile, 
  compressImage,
  getImageDimensions 
} from "@aha.chat/ui/lib/file-utils"

// Validate files
const result = validateFiles(files, {
  maxSize: 5 * 1024 * 1024,
  maxFiles: 10,
  allowedTypes: ["image/*", "video/*"]
})

// Compress image
const compressedFile = await compressImage(file, {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.8
})

// Get image dimensions
const { width, height } = await getImageDimensions(file)
```

## Migration from Chat Input

The following functions were extracted from `chat-input.tsx`:

### Removed Functions:
- `onUpload` - Replaced by `useChatFileUpload.onUpload`
- `onFileReject` - Replaced by `useChatFileUpload.onFileReject`
- `onFilesChange` - Replaced by `useChatFileUpload.setFiles`
- File state management - Replaced by `useChatFileUpload` state

### Removed State:
- `files` state - Now managed by `useChatFileUpload`
- `isUploading` state - Now managed by `useChatFileUpload`

## Benefits

1. **Reusability**: Upload functionality can now be used across different components
2. **Separation of Concerns**: File handling logic is separated from UI logic
3. **Testability**: Hooks and utilities can be tested independently
4. **Maintainability**: Centralized file upload logic is easier to maintain
5. **Type Safety**: Full TypeScript support with proper type definitions
6. **Error Handling**: Consistent error handling across all upload components
7. **Performance**: Optimized with proper memoization and cleanup

## Integration

To use these utilities in other components:

```tsx
// For generic file uploads
import { useFileUpload } from "@aha.chat/ui"

// For chat-specific uploads
import { useChatFileUpload } from "../hooks/use-chat-file-upload"

// For file utilities
import { validateFiles, formatFileSize } from "@aha.chat/ui"
```
