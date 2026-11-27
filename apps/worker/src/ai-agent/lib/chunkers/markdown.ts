import {
  assertStructuredChunkSize,
  maxLabelLength,
  truncateLabel,
} from "./limits"
import { chunkProse } from "./prose"
import type { ChunkOptions, TextChunk } from "./types"

type MarkdownSection = { path: string[]; body: string }
const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

function pathLabel(path: string[], maxLength: number): string {
  const full = path.join(" > ")
  if (full.length <= maxLength) {
    return full
  }
  // Drop the outermost headings first: the deepest one names the section best.
  const kept = [...path]
  while (kept.length > 1 && `… > ${kept.join(" > ")}`.length > maxLength) {
    kept.shift()
  }
  const prefix = kept.length === path.length ? "" : "… > "
  return truncateLabel(`${prefix}${kept.join(" > ")}`, maxLength)
}

function parseSections(text: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  const stack: string[] = []
  let body: string[] = []
  let currentPath: string[] = []
  let codeFence: "```" | "~~~" | undefined

  const flush = () => {
    const joined = body.join("\n").trim()
    if (joined) {
      sections.push({ path: currentPath, body: joined })
    }
    body = []
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trimStart()
    let fence: "```" | "~~~" | undefined
    if (trimmed.startsWith("```")) {
      fence = "```"
    } else if (trimmed.startsWith("~~~")) {
      fence = "~~~"
    }
    if (fence) {
      if (!codeFence) {
        codeFence = fence
      } else if (codeFence === fence) {
        codeFence = undefined
      }
      body.push(line)
      continue
    }

    const heading = codeFence ? undefined : line.match(ATX_HEADING)
    if (!heading) {
      body.push(line)
      continue
    }

    flush()
    const level = heading[1]?.length ?? 1
    const title = heading[2]?.trim() ?? ""
    stack.splice(level - 1)
    stack[level - 1] = title
    currentPath = stack.filter(Boolean)
  }
  flush()
  return sections
}

export function chunkMarkdown(
  text: string,
  { chunkSize, overlapSize }: ChunkOptions,
): readonly TextChunk[] {
  const sections = parseSections(text)
  if (!sections.some((section) => section.path.length > 0)) {
    return chunkProse(text, { chunkSize, overlapSize })
  }

  assertStructuredChunkSize(chunkSize)
  const labelLimit = maxLabelLength(chunkSize)
  const chunks: TextChunk[] = []
  let current = ""
  const flush = () => {
    if (current) {
      chunks.push({ content: current })
      current = ""
    }
  }

  for (const section of sections) {
    const label = section.path.length ? pathLabel(section.path, labelLimit) : ""
    const rendered = label ? `${label}\n${section.body}` : section.body
    const separator = current ? "\n\n" : ""
    if (current.length + separator.length + rendered.length <= chunkSize) {
      current += `${separator}${rendered}`
      continue
    }

    flush()
    if (rendered.length <= chunkSize) {
      current = rendered
      continue
    }

    if (!label) {
      chunks.push(...chunkProse(section.body, { chunkSize, overlapSize }))
      continue
    }

    const bodyBudget = chunkSize - label.length - 1
    const actualOverlap = Math.min(overlapSize, Math.floor(bodyBudget / 2))
    for (const piece of chunkProse(section.body, {
      chunkSize: bodyBudget,
      overlapSize: actualOverlap,
    })) {
      chunks.push({ content: `${label}\n${piece.content}` })
    }
  }

  flush()
  return chunks
}
