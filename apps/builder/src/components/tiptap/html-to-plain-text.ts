import { htmlToText } from "html-to-text"

const LINE_BREAK_REGEX = /\r\n?|\n/

const BLOCK_TAG_NAMES = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BR",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
])

// Converts pasted HTML into plain text while keeping block/line breaks as "\n",
// so callers can re-wrap it into <p> tags themselves instead of losing the
// paragraph structure to a single flattened text node.
export const htmlToPlainTextWithBlocks = (html: string) => {
  if (typeof DOMParser === "undefined") {
    return htmlToText(html, { wordwrap: false })
  }

  const document = new DOMParser().parseFromString(html, "text/html")
  const parts: string[] = []

  const appendLineBreak = () => {
    if (parts.at(-1) !== "\n") {
      parts.push("\n")
    }
  }

  const walk = (node: Node, previousSiblingWasBr = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "")
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    const element = node as Element
    const tagName = element.tagName

    if (tagName === "BR") {
      if (previousSiblingWasBr) {
        // A <br> directly following another <br> is a deliberate blank
        // line and must be forced through instead of deduped away.
        parts.push("\n")
      } else {
        // A lone <br> is an ordinary separator (e.g. between block-level
        // elements in email-signature-style HTML) — dedupe it like any
        // other block boundary so it doesn't add a spurious blank line.
        appendLineBreak()
      }
      return
    }

    const isBlock = BLOCK_TAG_NAMES.has(tagName)

    if (isBlock && parts.length > 0) {
      appendLineBreak()
    }

    const contentStart = parts.length

    if (tagName === "LI") {
      parts.push("- ")
    }

    walkChildren(Array.from(element.childNodes))

    if (isBlock) {
      if (parts.length === contentStart) {
        // Genuinely empty block (e.g. a blank paragraph between two lines of
        // text) — force the break instead of deduping it away, otherwise the
        // blank line silently disappears on paste.
        parts.push("\n")
      } else {
        appendLineBreak()
      }
    }
  }

  function walkChildren(nodes: ChildNode[]) {
    let previousWasBr = false
    for (const child of nodes) {
      walk(child, previousWasBr)
      previousWasBr =
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).tagName === "BR"
    }
  }

  walkChildren(Array.from(document.body.childNodes))

  return parts
    .join("")
    .replace(/\xA0/g, " ")
    .split(LINE_BREAK_REGEX)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}
