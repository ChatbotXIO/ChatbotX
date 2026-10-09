import { MARKDOWN_ESCAPE_PATTERN } from "@chatbotx.io/mini-app"
import { Fragment, type ReactNode } from "react"

/**
 * The markdown subset WhatsApp Flows render in RichText / `markdown: true`
 * text: `#`/`##` headings, paragraphs, single-level lists, **bold**,
 *italic* / _italic_, ~~strike~~ and [links](https://…). Built as React
 * elements — no raw HTML is ever injected. A backslash shows the next
 * markdown character as is (`\*` → `*`), which is how contact values are
 * kept from being read as markdown.
 */

// Escaped characters are parked on private-use code points while the
// markdown is parsed, then put back in every piece of rendered text.
const ESCAPE_BASE = 0xe0_00
const ESCAPED_PLACEHOLDER = /[\uE000-\uE07F]/g

const protectEscapes = (source: string): string =>
  source.replace(MARKDOWN_ESCAPE_PATTERN, (_match, char: string) =>
    String.fromCharCode(ESCAPE_BASE + char.charCodeAt(0)),
  )

const restoreEscapes = (text: string): string =>
  text.replace(ESCAPED_PLACEHOLDER, (char) =>
    String.fromCharCode(char.charCodeAt(0) - ESCAPE_BASE),
  )

const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g
const LINK_PATTERN = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/
const ORDERED_ITEM = /^\d+\.\s+/
const UNORDERED_ITEM = /^[-*]\s+/

const renderInline = (text: string): ReactNode[] =>
  text.split(INLINE_PATTERN).map((part, index) => {
    const key = `${index}-${part}`
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{restoreEscapes(part.slice(2, -2))}</strong>
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <s key={key}>{restoreEscapes(part.slice(2, -2))}</s>
    }
    if (
      part.length > 2 &&
      ((part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_")))
    ) {
      return <em key={key}>{restoreEscapes(part.slice(1, -1))}</em>
    }
    const link = LINK_PATTERN.exec(part)
    if (link) {
      return (
        <a
          className="text-[#027eb5] underline"
          href={restoreEscapes(link[2] ?? "")}
          key={key}
          rel="noopener noreferrer"
          target="_blank"
        >
          {restoreEscapes(link[1] ?? "")}
        </a>
      )
    }
    return <Fragment key={key}>{restoreEscapes(part)}</Fragment>
  })

type Block =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }

const parseBlocks = (source: string): Block[] => {
  const blocks: Block[] = []
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trimEnd()
    const previous = blocks.at(-1)
    if (!line.trim()) {
      blocks.push({ kind: "paragraph", text: "" })
      continue
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", level: 2, text: line.slice(3) })
      continue
    }
    if (line.startsWith("# ")) {
      blocks.push({ kind: "heading", level: 1, text: line.slice(2) })
      continue
    }
    const ordered = ORDERED_ITEM.test(line)
    if (ordered || UNORDERED_ITEM.test(line)) {
      const text = line.replace(ordered ? ORDERED_ITEM : UNORDERED_ITEM, "")
      if (previous?.kind === "list" && previous.ordered === ordered) {
        previous.items.push(text)
      } else {
        blocks.push({ kind: "list", ordered, items: [text] })
      }
      continue
    }
    if (previous?.kind === "paragraph" && previous.text) {
      previous.text += `\n${line}`
    } else {
      blocks.push({ kind: "paragraph", text: line })
    }
  }
  return blocks.filter((block) => block.kind !== "paragraph" || block.text)
}

export function SimpleMarkdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-2">
      {parseBlocks(protectEscapes(source)).map((block, index) => {
        const key = `${block.kind}-${index}`
        if (block.kind === "heading") {
          return block.level === 1 ? (
            <h1 className="font-bold text-xl" key={key}>
              {renderInline(block.text)}
            </h1>
          ) : (
            <h2 className="font-semibold text-lg" key={key}>
              {renderInline(block.text)}
            </h2>
          )
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul"
          return (
            <ListTag
              className={block.ordered ? "list-decimal ps-5" : "list-disc ps-5"}
              key={key}
            >
              {block.items.map((item, itemIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static markdown list
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ListTag>
          )
        }
        return (
          <p className="whitespace-pre-wrap" key={key}>
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}
