import { StepType } from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
import { chatQueue, ChatJobAction } from "@aha.chat/worker-config"
import { uploader } from "@aha.chat/filesystem"
import { prisma } from "@aha.chat/database"
import { FileType } from "@aha.chat/database/types"
import imageSize from "image-size"
import { SUPPORTED_IMAGE_EXTENSIONS } from "./constants"

function isImageUrl(url: string): boolean {
    const s = url.trim().toLowerCase()
    if (!(s.startsWith("http://") || s.startsWith("https://"))) return false
    try {
        const u = new URL(s)
        const p = u.pathname.toLowerCase()
        return SUPPORTED_IMAGE_EXTENSIONS.some(ext => p.endsWith(ext))
    } catch {
        return false
    }
}

export async function downloadAndUploadImage(
    imageUrl: string,
    conversationId: string,
): Promise<boolean> {
    try {
        const res = await fetch(imageUrl, { redirect: "follow" as any })
        if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)

        const contentType = res.headers.get("content-type") || "application/octet-stream"
        const arrayBuf = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)

        // Detect filename from URL if possible
        let detectedName: string | null = null
        try {
            const u = new URL(imageUrl)
            const last = u.pathname.split("/").pop() ?? ""
            detectedName = last ? decodeURIComponent(last) : null
        } catch {
            detectedName = null
        }

        // Detect image dimensions
        let detectedWidth: number | undefined
        let detectedHeight: number | undefined
        if (contentType.startsWith("image/")) {
            const dims = imageSize(buffer)
            detectedWidth = dims.width
            detectedHeight = dims.height
        }

        const path = `public/conversations/${conversationId}/${createId()}`
        await uploader.putObject(path, buffer, {
            ACL: "public-read",
            ContentType: contentType,
            ContentLength: buffer.length,
        })

        await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
            type: ChatJobAction.SEND_FLOW_STEP,
            data: {
                conversationId,
                flowVersionId: "",
                step: {
                    id: createId(),
                    stepType: StepType.SEND_IMAGE,
                    mode: "file",
                    url: path,
                    buttons: [],
                    attachment: {
                        originPath: path,
                        name: detectedName,
                        mimeType: contentType,
                        size: buffer.length,
                        width: detectedWidth,
                        height: detectedHeight,
                        fileType: FileType.IMAGE,
                    },
                } as any,
            },
        })

        return true
    } catch (error) {
        console.error("Error downloading and uploading image:", error)
        return false
    }
}



export function processTextForImagesAndLinks(text: string): string[] {
    const parts: string[] = []
    const seenUrls = new Set<string>()

    const cleanText = (t: string): string => {
        let s = String(t ?? "")
        s = s.replace(/^[\-*]\s*/u, "")
        s = s.trim()
        return s
    }

    const mdLink = /\[([^\]]+)\]\(\s*([^)\s\r\n]+)\s*\)/g
    const rawUrl = /(https?:\/\/[^\s)\]]+(?:\?[^\s)\]]*)?)/g

    let cursor = 0
    while (cursor < text.length) {
        mdLink.lastIndex = cursor
        rawUrl.lastIndex = cursor
        const m1 = mdLink.exec(text)
        const m2 = rawUrl.exec(text)

        const idx1 = m1 ? m1.index : Infinity
        const idx2 = m2 ? m2.index : Infinity

        if (idx1 === Infinity && idx2 === Infinity) {
            const tail = cleanText(text.slice(cursor))
            if (tail) parts.push(tail)
            break
        }

        if (idx1 <= idx2) {
            if (idx1 > cursor) {
                const before = cleanText(text.slice(cursor, idx1))
                if (before) parts.push(before)
            }
            const url = (m1![2] || "").trim()
            if (url && !seenUrls.has(url)) {
                seenUrls.add(url)
                parts.push(url)
            }
            cursor = idx1 + m1![0].length
        } else {
            if (idx2 > cursor) {
                const before = cleanText(text.slice(cursor, idx2))
                if (before) parts.push(before)
            }
            const url = (m2![1] || "").trim()
            if (url && !seenUrls.has(url)) {
                seenUrls.add(url)
                parts.push(url)
            }
            cursor = idx2 + m2![0].length
        }
    }

    return parts.filter((p) => {
        const t = p.trim()
        if (!t) return false
        if (/^\s*$/.test(t)) return false
        if (/^[\u{1F300}-\u{1F9FF}]+$/u.test(t)) return false
        return true
    })
}

export async function sendMessageWithRender(
    conversationId: string,
    message: string,
): Promise<void> {
    const trimmed = message.trim()
    if (isImageUrl(trimmed)) {
        const success = await downloadAndUploadImage(trimmed, conversationId)
        if (success) {
            return
        }
    }

    await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
        type: ChatJobAction.SEND_FLOW_STEP,
        data: {
            conversationId,
            flowVersionId: "",
            step: {
                id: createId(),
                message: message,
                stepType: StepType.SEND_TEXT,
                buttons: [],
            },
        },
    })
}

export async function sendProcessedTextParts(
    conversationId: string,
    text: string,
): Promise<number> {
    let count = 0
    const parts = processTextForImagesAndLinks(text)
    for (const part of parts) {
        const trimmedPart = part.trim()
        if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
            count++
            await sendMessageWithRender(conversationId, trimmedPart)
        }
    }
    return count
}

export async function processStreamingText(
    textStream: AsyncIterable<string>,
    conversationId: string,
    options?: { sendParts?: boolean },
): Promise<{ messageCount: number; fullText: string }> {
    let fullText = ""
    let messageCount = 0
    const sendParts = options?.sendParts !== false
    let currentSegment = ""

    for await (const delta of textStream) {
        fullText += delta
        currentSegment += delta

        if (currentSegment.includes('\n\n')) {
            const segments = currentSegment.split('\n\n')

            for (let i = 0; i < segments.length - 1; i++) {
                const segment = segments[i].trim()
                if (!segment) continue
                const processedParts = processTextForImagesAndLinks(segment)

                for (const part of processedParts) {
                    const trimmedPart = part.trim()
                    if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
                        messageCount++
                        if (sendParts) {
                            await sendMessageWithRender(conversationId, trimmedPart)
                        }
                    }
                }
            }

            currentSegment = segments[segments.length - 1] || ""
        }
    }

    if (currentSegment.trim()) {
        const processedParts = processTextForImagesAndLinks(currentSegment.trim())
        for (const part of processedParts) {
            const trimmedPart = part.trim()
            if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
                messageCount++
                if (sendParts) {
                    await sendMessageWithRender(conversationId, trimmedPart)
                }
            }
        }
    }

    return { messageCount, fullText }
}


