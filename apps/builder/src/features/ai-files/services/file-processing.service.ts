"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import { createOpenAI } from "@ai-sdk/openai"
import { createId } from "@paralleldrive/cuid2"
import { embed } from "ai"
import type { SecretTextAuthValue } from "@aha.chat/sdk"
// PDF processing removed - only support TXT files for now

// Types for file processing
interface FileProcessingConfig {
    readonly chatbotId: string
    readonly aiFileId: string
    readonly filePath: string
    readonly mimeType: string
    readonly chunkSize?: number
    readonly overlapSize?: number
}

interface TextChunk {
    readonly content: string
    readonly startIndex: number
    readonly endIndex: number
}

interface EmbeddingResult {
    readonly content: string
    readonly embedding: readonly number[]
    readonly chunkIndex: number
}

// Constants
const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_OVERLAP_SIZE = 200
const MIN_CHUNK_SIZE = 50
const MAX_CHUNK_SIZE = 4000

// Supported file types for text extraction (TXT only for now)
const SUPPORTED_TEXT_TYPES = [
    'text/plain',
    'text/markdown',
    'text/csv'
] as const

type SupportedMimeType = (typeof SUPPORTED_TEXT_TYPES)[number]

// Helper function to check if file type is supported
function isSupportedFileType(mimeType: string): mimeType is SupportedMimeType {
    return SUPPORTED_TEXT_TYPES.includes(mimeType as SupportedMimeType)
}

// Helper function to get OpenAI integration
async function getOpenAIIntegration(chatbotId: string) {
    const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
        where: {
            chatbotId,
            autoReply: true,
        },
    })

    if (!integrationOpenAI) {
        throw new Error("Không tìm thấy cấu hình OpenAI")
    }

    return integrationOpenAI
}

// Helper function to create OpenAI client
async function createOpenAIClient(chatbotId: string) {
    console.log(`[FILE_PROCESSING] Getting OpenAI integration for chatbot: ${chatbotId}`)
    const integrationOpenAI = await getOpenAIIntegration(chatbotId)
    console.log(`[FILE_PROCESSING] OpenAI integration found: ${integrationOpenAI.id}`)

    const apiKey = (integrationOpenAI.auth as SecretTextAuthValue | null)?.secretText
    console.log(`[FILE_PROCESSING] API key available: ${apiKey ? 'Yes' : 'No'}`)

    return createOpenAI({
        apiKey: apiKey,
    })
}

// Helper function to extract text from different file types
async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
    try {
        console.log(`[FILE_PROCESSING] Reading file from MinIO: ${filePath}`)
        console.log(`[FILE_PROCESSING] MIME type: ${mimeType}`)

        // Download file from MinIO - try both with and without 'public/' prefix
        let fileBuffer: Buffer
        try {
            fileBuffer = await uploader.getObject(filePath)
            console.log(`[FILE_PROCESSING] Successfully downloaded with original path: ${filePath}`)
        } catch (error) {
            // If original path fails, try without 'public/' prefix
            if (filePath.startsWith('public/')) {
                const pathWithoutPublic = filePath.substring(7)
                console.log(`[FILE_PROCESSING] Original path failed, trying without 'public/': ${pathWithoutPublic}`)
                fileBuffer = await uploader.getObject(pathWithoutPublic)
                console.log(`[FILE_PROCESSING] Successfully downloaded with path without 'public/': ${pathWithoutPublic}`)
            } else {
                throw error // Re-throw if it's not a 'public/' prefix issue
            }
        }

        console.log(`[FILE_PROCESSING] File size: ${fileBuffer.length} bytes`)

        switch (mimeType) {
            case 'text/plain':
            case 'text/markdown':
                return fileBuffer.toString('utf-8')

            case 'text/csv':
                return fileBuffer.toString('utf-8')

            case 'application/pdf':
                // PDF processing not supported - return helpful message
                console.log(`[FILE_PROCESSING] PDF file detected but processing not supported`)
                return `PDF file detected (${fileBuffer.length} bytes) but PDF processing is not currently supported. Please convert your PDF to text format (.txt) before uploading for processing.`

            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                // DOCX processing not supported
                return `DOCX file detected (${fileBuffer.length} bytes) but DOCX processing is not currently supported. Please convert your document to text format (.txt) before uploading for processing.`

            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                // XLSX processing not supported
                return `XLSX file detected (${fileBuffer.length} bytes) but XLSX processing is not currently supported. Please convert your spreadsheet to text format (.txt) before uploading for processing.`

            default:
                throw new Error(`Unsupported file type: ${mimeType}`)
        }
    } catch (error) {
        console.error("Error extracting text from file:", error)

        if (error instanceof Error) {
            const nodeError = error as NodeJS.ErrnoException
            if (nodeError.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`)
            } else if (nodeError.code === 'EACCES') {
                throw new Error(`Permission denied: ${filePath}`)
            } else {
                throw new Error(`Failed to extract text from file: ${error.message}`)
            }
        }

        throw new Error(`Failed to extract text from file: Unknown error`)
    }
}

// Helper function to split text into chunks
function splitTextIntoChunks(text: string, chunkSize: number = DEFAULT_CHUNK_SIZE, overlapSize: number = DEFAULT_OVERLAP_SIZE): readonly TextChunk[] {
    console.log(`[CHUNKING] Starting chunking - Text length: ${text.length}, Chunk size: ${chunkSize}, Overlap: ${overlapSize}`)

    const chunks: TextChunk[] = []
    let startIndex = 0
    let iterationCount = 0
    const maxIterations = Math.ceil(text.length / Math.max(1, chunkSize - overlapSize)) + 10 // Safety limit

    while (startIndex < text.length && iterationCount < maxIterations) {
        iterationCount++
        console.log(`[CHUNKING] Iteration ${iterationCount}, startIndex: ${startIndex}, text.length: ${text.length}`)

        const endIndex = Math.min(startIndex + chunkSize, text.length)
        let chunkText = text.slice(startIndex, endIndex)

        // Try to break at sentence boundary if possible
        if (endIndex < text.length) {
            const lastSentenceEnd = chunkText.lastIndexOf('.')
            const lastNewline = chunkText.lastIndexOf('\n')
            const breakPoint = Math.max(lastSentenceEnd, lastNewline)

            if (breakPoint > chunkSize * 0.5) { // Only break if we're not losing too much content
                chunkText = chunkText.slice(0, breakPoint + 1)
            }
        }

        const chunkLength = chunkText.length
        console.log(`[CHUNKING] Created chunk ${chunks.length + 1} - Length: ${chunkLength}`)
        console.log(`[CHUNKING] Chunk ${chunks.length + 1} preview (first 100 chars):`, chunkText.trim().substring(0, 100))
        console.log(`[CHUNKING] Chunk ${chunks.length + 1} preview (last 100 chars):`, chunkText.trim().substring(Math.max(0, chunkText.trim().length - 100)))

        chunks.push({
            content: chunkText.trim(),
            startIndex,
            endIndex: startIndex + chunkLength
        })

        // Calculate next start index with overlap
        const nextStartIndex = startIndex + chunkLength - overlapSize
        console.log(`[CHUNKING] Next start index: ${nextStartIndex} (current: ${startIndex}, chunkLength: ${chunkLength}, overlap: ${overlapSize})`)

        // Safety check to prevent infinite loop
        if (nextStartIndex <= startIndex) {
            console.warn(`[CHUNKING] WARNING: nextStartIndex (${nextStartIndex}) <= startIndex (${startIndex}), breaking to prevent infinite loop`)
            break
        }

        startIndex = nextStartIndex
    }

    console.log(`[CHUNKING] Completed - Created ${chunks.length} chunks in ${iterationCount} iterations`)
    return chunks.filter(chunk => chunk.content.length > 0)
}

// Helper function to create embedding for text chunk
async function createTextEmbedding(text: string, chatbotId: string): Promise<readonly number[]> {
    console.log(`[FILE_PROCESSING] Creating OpenAI client for chatbot: ${chatbotId}`)
    const openai = await createOpenAIClient(chatbotId)
    console.log(`[FILE_PROCESSING] OpenAI client created successfully`)

    const embeddingModel = openai.embedding("text-embedding-ada-002")
    console.log(`[FILE_PROCESSING] Embedding model initialized`)

    console.log(`[FILE_PROCESSING] Calling OpenAI embedding API...`)
    console.log(`[FILE_PROCESSING] Text length: ${text.length} characters`)

    // Add timeout handling
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI API call timeout after 30 seconds')), 30000)
    })

    const embeddingPromise = embed({
        model: embeddingModel,
        value: text,
    })

    const { embedding } = await Promise.race([embeddingPromise, timeoutPromise])
    console.log(`[FILE_PROCESSING] OpenAI embedding API call completed - Vector length: ${embedding.length}`)

    return embedding
}

// Helper function to save embedding to database
async function saveEmbeddingToDatabase(
    content: string,
    embedding: readonly number[],
    chatbotId: string,
    aiFileId: string
): Promise<void> {
    const embeddingString = `[${embedding.join(',')}]`

    await prisma.$queryRaw`
    INSERT INTO "AIEmbedding" ("id", "createdAt", "updatedAt", "content", "embedding", "chatbotId", "aiFileId") 
    VALUES (${createId()}, ${new Date()}, ${new Date()}, ${content}, ${embeddingString}::vector, ${chatbotId}, ${aiFileId})
  `
}

// Result type for file processing
interface FileProcessingResult {
    readonly success: boolean
    readonly chunksProcessed: number
    readonly error?: string
}

// Main function to process file and create embeddings
export async function processFileForEmbeddings(config: FileProcessingConfig): Promise<FileProcessingResult> {
    // Add overall timeout for the entire process
    const processTimeout = new Promise<FileProcessingResult>((_, reject) => {
        setTimeout(() => {
            console.log(`[FILE_PROCESSING] Process timeout after 2 minutes`)
            reject(new Error('File processing timeout after 2 minutes'))
        }, 120000) // 2 minutes timeout
    })

    const processPromise = (async () => {
        try {
            console.log(`[FILE_PROCESSING] Starting processing for file: ${config.filePath}`)
            console.log(`[FILE_PROCESSING] Config:`, {
                chatbotId: config.chatbotId,
                aiFileId: config.aiFileId,
                mimeType: config.mimeType,
                chunkSize: config.chunkSize,
                overlapSize: config.overlapSize
            })

            // Check if file type is supported
            if (!isSupportedFileType(config.mimeType)) {
                console.log(`[FILE_PROCESSING] Unsupported file type: ${config.mimeType}`)
                return {
                    success: false,
                    chunksProcessed: 0,
                    error: `Unsupported file type: ${config.mimeType}`
                }
            }

            // Extract text from file
            const textContent = await extractTextFromFile(config.filePath, config.mimeType)

            if (!textContent.trim()) {
                return {
                    success: false,
                    chunksProcessed: 0,
                    error: "No text content found in file"
                }
            }

            console.log(`[FILE_PROCESSING] Extracted text length: ${textContent.length}`)
            console.log(`[FILE_PROCESSING] Extracted text preview (first 200 chars):`, textContent.substring(0, 200))
            console.log(`[FILE_PROCESSING] Extracted text preview (last 200 chars):`, textContent.substring(Math.max(0, textContent.length - 200)))
            console.log(`[FILE_PROCESSING] Memory before chunking: ${JSON.stringify(process.memoryUsage())}`)

            // Validate and set chunk parameters
            const chunkSize = Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, config.chunkSize ?? DEFAULT_CHUNK_SIZE))
            const overlapSize = Math.max(0, Math.min(chunkSize - 1, config.overlapSize ?? DEFAULT_OVERLAP_SIZE))

            console.log(`[FILE_PROCESSING] Chunk parameters: size=${chunkSize}, overlap=${overlapSize}`)

            // Split text into chunks
            const chunks = splitTextIntoChunks(textContent, chunkSize, overlapSize)

            console.log(`[FILE_PROCESSING] Created ${chunks.length} chunks`)
            console.log(`[FILE_PROCESSING] Memory after chunking: ${JSON.stringify(process.memoryUsage())}`)

            // Check if chunks are reasonable
            if (chunks.length > 1000) {
                console.warn(`[FILE_PROCESSING] WARNING: Too many chunks (${chunks.length}), this might cause memory issues`)
                return {
                    success: false,
                    chunksProcessed: 0,
                    error: `Too many chunks created (${chunks.length}). Please reduce chunk size or file size.`
                }
            }

            // Process each chunk and create embeddings
            let processedChunks = 0
            const errors: string[] = []

            console.log(`[FILE_PROCESSING] Starting embedding creation for ${chunks.length} chunks`)

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i]

                try {
                    console.log(`[FILE_PROCESSING] Processing chunk ${i + 1}/${chunks.length} - Length: ${chunk.content.length}`)
                    console.log(`[FILE_PROCESSING] Memory before chunk ${i + 1}: ${JSON.stringify(process.memoryUsage())}`)

                    // Create embedding for this chunk
                    console.log(`[FILE_PROCESSING] Creating embedding for chunk ${i + 1}...`)
                    const embedding = await createTextEmbedding(chunk.content, config.chatbotId)
                    console.log(`[FILE_PROCESSING] Embedding created for chunk ${i + 1} - Vector length: ${embedding.length}`)

                    // Save to database
                    console.log(`[FILE_PROCESSING] Saving chunk ${i + 1} to database...`)
                    await saveEmbeddingToDatabase(
                        chunk.content,
                        embedding,
                        config.chatbotId,
                        config.aiFileId
                    )
                    console.log(`[FILE_PROCESSING] Chunk ${i + 1} saved to database successfully`)
                    console.log(`[FILE_PROCESSING] Memory after chunk ${i + 1}: ${JSON.stringify(process.memoryUsage())}`)

                    processedChunks++
                    console.log(`[FILE_PROCESSING] Processed chunk ${i + 1}/${chunks.length}`)

                    // Add small delay to prevent overwhelming the system
                    if (i % 10 === 0 && i > 0) {
                        console.log(`[FILE_PROCESSING] Processed ${i} chunks, taking a small break...`)
                        await new Promise(resolve => setTimeout(resolve, 100)) // 100ms break
                    }

                } catch (chunkError) {
                    const errorMessage = `Chunk ${i + 1}: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`
                    console.error(`[FILE_PROCESSING] Error processing chunk ${i + 1}:`, chunkError)
                    errors.push(errorMessage)
                    // Continue with other chunks even if one fails
                }
            }

            // Log any errors that occurred
            if (errors.length > 0) {
                console.warn(`[FILE_PROCESSING] ${errors.length} chunks failed to process:`, errors)
            }

            console.log(`[FILE_PROCESSING] Successfully processed ${processedChunks} chunks`)

            return {
                success: true,
                chunksProcessed: processedChunks
            }

        } catch (error) {
            console.error("[FILE_PROCESSING] Error processing file:", error)
            console.error("[FILE_PROCESSING] Error stack:", error instanceof Error ? error.stack : "No stack trace")

            return {
                success: false,
                chunksProcessed: 0,
                error: error instanceof Error ? error.message : "Unknown error"
            }
        }
    })()

    // Race between process and timeout
    return Promise.race([processPromise, processTimeout])
}

// Helper function to get file path from relative path
export async function getFilePathFromRelative(relativePath: string): Promise<string> {
    console.log(`[FILE_PROCESSING] Original relative path: ${relativePath}`)

    // For MinIO, we use the path as-is since files are stored directly in MinIO
    // Try both with and without 'public/' prefix to see which one works
    let actualPath = relativePath

    // First try with the original path (including 'public/')
    console.log(`[FILE_PROCESSING] Trying MinIO object key: ${actualPath}`)

    return actualPath
}
