import { describe, expect, test } from "vitest"
import { chunkKnowledgeDocument } from "../src/ai-agent/lib/chunkers"
import { chunkMarkdown } from "../src/ai-agent/lib/chunkers/markdown"
import { chunkProse } from "../src/ai-agent/lib/chunkers/prose"
import { chunkTabular } from "../src/ai-agent/lib/chunkers/tabular"

// Verbatim copy of the pre-Phase-1 `splitTextIntoChunks` from
// process-ai-file.ts: prose chunks (and so their embedding ids) must not move.
function legacySplitTextIntoChunks(
  text: string,
  chunkSize = 1000,
  overlapSize = 200,
): readonly { content: string }[] {
  const chunks: { content: string }[] = []
  if (!text || chunkSize <= 0) {
    return chunks
  }

  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const piece = text.slice(start, end).trim()
    if (piece.length > 0) {
      chunks.push({ content: piece })
    }
    if (end === text.length) {
      break
    }
    start = Math.max(0, end - overlapSize)
  }
  return chunks
}

const digits = (length: number) =>
  Array.from({ length }, (_, index) => String(index % 10)).join("")

describe("chunkProse", () => {
  test.each([
    ["empty", "", 1000, 200],
    ["shorter than a chunk", "alpha beta gamma", 1000, 200],
    ["exactly one chunk", "x".repeat(1000), 1000, 200],
    ["one character over a chunk", "x".repeat(1001), 1000, 200],
    ["long text", digits(5432), 1000, 200],
    ["lots of whitespace", `  ${"word   ".repeat(400)}  `, 1000, 200],
    ["no overlap", " alpha beta gamma ", 10, 0],
    ["non-positive chunk size", "alpha", 0, 0],
  ])("matches the legacy chunker: %s", (_name, text, chunkSize, overlapSize) => {
    expect(chunkProse(text, { chunkSize, overlapSize })).toEqual(
      legacySplitTextIntoChunks(text, chunkSize, overlapSize),
    )
  })
})

describe("chunkTabular", () => {
  // Pinned output format: if this changes, bump
  // AI_FILE_CHUNKER_VERSIONS.tabular in @chatbotx.io/database/partials.
  test("renders the documented chunk format", () => {
    const chunks = chunkTabular(
      [
        {
          name: "Bảng giá",
          headers: ["Tên SP", "Giá", "Thời hạn"],
          rows: [
            ["Gói Basic", "199.000", "6 tháng"],
            ["Gói Pro", "499.000", "12 tháng"],
          ],
        },
      ],
      { chunkSize: 1000, overlapSize: 200 },
    )

    expect(chunks).toEqual([
      {
        content: [
          "Sheet: Bảng giá",
          "",
          "Tên SP: Gói Basic",
          "Giá: 199.000",
          "Thời hạn: 6 tháng",
          "",
          "Tên SP: Gói Pro",
          "Giá: 499.000",
          "Thời hạn: 12 tháng",
        ].join("\n"),
      },
    ])
  })

  test("keeps rows and column names together without crossing sheets", () => {
    const chunks = chunkTabular(
      [
        {
          name: "Prices",
          headers: ["Product", "Price"],
          rows: [
            ["Basic", "199000"],
            ["Pro", "499000"],
          ],
        },
        {
          name: "Stock",
          headers: ["SKU", "Quantity"],
          rows: [["sku-1", "12"]],
        },
      ],
      { chunkSize: 100, overlapSize: 200 },
    )

    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.content).toContain("Sheet: Prices")
    expect(chunks[0]?.content).toContain("Product: Basic")
    expect(chunks[1]?.content).toContain("Sheet: Stock")
    expect(chunks[1]?.content).not.toContain("Product")
    expect(chunks.every((chunk) => chunk.content.length <= 100)).toBe(true)
  })

  test("skips empty cells and rows, and names unnamed columns", () => {
    const chunks = chunkTabular(
      [
        {
          name: "Sheet1",
          headers: ["Name", "", "Note"],
          rows: [
            ["Basic", "", "popular"],
            ["", "", ""],
            ["Pro", "extra", ""],
          ],
        },
      ],
      { chunkSize: 1000, overlapSize: 0 },
    )

    expect(chunks).toEqual([
      {
        content:
          "Sheet: Sheet1\n\nName: Basic\nNote: popular\n\nName: Pro\nColumn 2: extra",
      },
    ])
  })

  test("never splits a row that fits a chunk across two chunks", () => {
    const rows = Array.from({ length: 200 }, (_, index) => [
      `product-${index}`,
      digits(30 + (index % 40)),
    ])
    const chunks = chunkTabular(
      [{ name: "Catalog", headers: ["Product", "Description"], rows }],
      { chunkSize: 1000, overlapSize: 200 },
    )

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1000)
      expect(chunk.content.startsWith("Sheet: Catalog\n\n")).toBe(true)
    }
    for (const [product, description] of rows) {
      const block = `Product: ${product}\nDescription: ${description}`
      expect(
        chunks.filter((chunk) => chunk.content.includes(block)),
      ).toHaveLength(1)
    }
  })

  test("splits an oversized row into parts of consecutive columns that repeat the key", () => {
    const headers = Array.from({ length: 20 }, (_, index) => `Col${index}`)
    const row = headers.map((_, index) => `${index}-${"v".repeat(40)}`)
    const chunks = chunkTabular([{ name: "Wide", headers, rows: [row] }], {
      chunkSize: 200,
      overlapSize: 0,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.length).toBeLessThan(headers.length)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(200)
      expect(chunk.content.startsWith("Sheet: Wide\n\nCol0: 0-")).toBe(true)
    }
    for (const [index, header] of headers.entries()) {
      const line = `${header}: ${row[index]}`
      expect(
        chunks.some((chunk) => chunk.content.split("\n").includes(line)),
      ).toBe(true)
    }
  })

  test("bounds long labels and keeps every character of a long key cell", () => {
    const keyValue = digits(5000)
    const chunks = chunkTabular(
      [
        {
          name: "s".repeat(500),
          headers: ["ID", "Note"],
          rows: [[keyValue, "short"]],
        },
      ],
      { chunkSize: 1000, overlapSize: 200 },
    )

    expect(chunks.every((chunk) => chunk.content.length <= 1000)).toBe(true)
    const keyPieces = chunks
      .map((chunk) => chunk.content.split("\n").at(-1) ?? "")
      .filter((line) => line.startsWith("ID: "))
      .map((line) => line.slice("ID: ".length))
    expect(keyPieces.join("")).toBe(keyValue)
    expect(chunks.at(-1)?.content.endsWith("\nNote: short")).toBe(true)
  })

  test.each([
    100, 1000,
  ])("keeps every chunk within %i characters for extreme labels and cells", (chunkSize) => {
    const longCell = digits(5000)
    const chunks = chunkTabular(
      [
        {
          name: "n".repeat(500),
          headers: ["k".repeat(500), "h".repeat(500)],
          rows: [
            [digits(5000), longCell],
            ["short", longCell],
          ],
        },
      ],
      { chunkSize, overlapSize: 0 },
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.content.length <= chunkSize)).toBe(
      true,
    )
    expect(chunks.every((chunk) => chunk.content.startsWith("Sheet: "))).toBe(
      true,
    )
  })

  test("rejects structured chunks smaller than the minimum", () => {
    expect(() => chunkTabular([], { chunkSize: 99, overlapSize: 0 })).toThrow(
      "Structured chunk size",
    )
  })
})

describe("chunkMarkdown", () => {
  // Pinned output format: if this changes, bump
  // AI_FILE_CHUNKER_VERSIONS.markdown in @chatbotx.io/database/partials.
  test("renders the documented chunk format", () => {
    const chunks = chunkMarkdown(
      [
        "# Chính sách",
        "## Đổi trả",
        "### Điều kiện",
        "- Sản phẩm còn nguyên tem, trong vòng 7 ngày",
        "- Có hóa đơn mua hàng",
        "### Phí",
        "Miễn phí đổi lần đầu, từ lần hai phí 30.000đ",
      ].join("\n"),
      { chunkSize: 1000, overlapSize: 200 },
    )

    expect(chunks).toEqual([
      {
        content: [
          "Chính sách > Đổi trả > Điều kiện",
          "- Sản phẩm còn nguyên tem, trong vòng 7 ngày",
          "- Có hóa đơn mua hàng",
          "",
          "Chính sách > Đổi trả > Phí",
          "Miễn phí đổi lần đầu, từ lần hai phí 30.000đ",
        ].join("\n"),
      },
    ])
  })

  test("adds nested heading paths and ignores headings inside fenced code", () => {
    const chunks = chunkMarkdown(
      [
        "# Policy",
        "## Returns",
        "### Conditions",
        "The item must be unopened.",
        "```md",
        "# not a heading",
        "```",
        "~~~",
        "## also not a heading",
        "~~~",
      ].join("\n"),
      { chunkSize: 1000, overlapSize: 20 },
    )

    expect(chunks).toHaveLength(1)
    expect(
      chunks[0]?.content.startsWith("Policy > Returns > Conditions\n"),
    ).toBe(true)
    expect(chunks[0]?.content).toContain("# not a heading")
    expect(chunks[0]?.content).toContain("## also not a heading")
  })

  test("builds the path across skipped heading levels", () => {
    const chunks = chunkMarkdown("# Guide\n### Setup\nInstall it.\n", {
      chunkSize: 1000,
      overlapSize: 0,
    })

    expect(chunks).toEqual([{ content: "Guide > Setup\nInstall it." }])
  })

  test("keeps the preamble without a path and does not render empty parent sections", () => {
    const chunks = chunkMarkdown("Intro text.\n# A\n## B\nBody of B.", {
      chunkSize: 1000,
      overlapSize: 0,
    })

    expect(chunks).toEqual([{ content: "Intro text.\n\nA > B\nBody of B." }])
  })

  test("keeps a full path that fits the label limit", () => {
    // labelLimit = 25: the 22-character path fits, "… > " + path would not.
    const chunks = chunkMarkdown("# Policy\n## Returns rules\nKeep receipts.", {
      chunkSize: 100,
      overlapSize: 0,
    })

    expect(chunks).toEqual([
      { content: "Policy > Returns rules\nKeep receipts." },
    ])
  })

  test("splits a long section and repeats its path on every piece", () => {
    const body = digits(2500)
    const chunks = chunkMarkdown(`# Policy\n## Returns\n${body}`, {
      chunkSize: 1000,
      overlapSize: 200,
    })

    expect(chunks.length).toBeGreaterThan(2)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1000)
      expect(chunk.content.startsWith("Policy > Returns\n")).toBe(true)
    }
  })

  test("bounds a six-level path of 300-character headings and keeps the deepest heading", () => {
    const headings = Array.from(
      { length: 6 },
      (_, index) => `${String(index + 1)}${"h".repeat(299)}`,
    )
    const chunks = chunkMarkdown(
      `${headings.map((heading, index) => `${"#".repeat(index + 1)} ${heading}`).join("\n")}\n${"body ".repeat(80)}`,
      { chunkSize: 100, overlapSize: 20 },
    )

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(100)
      expect(chunk.content.startsWith("… > 6h")).toBe(true)
    }
  })

  test("uses prose chunking when the markdown has no headings", () => {
    const text = "plain markdown text without headings".repeat(5)
    expect(chunkMarkdown(text, { chunkSize: 30, overlapSize: 0 })).toEqual(
      chunkProse(text, { chunkSize: 30, overlapSize: 0 }),
    )
  })

  test("rejects structured chunks smaller than the minimum", () => {
    expect(() =>
      chunkMarkdown("# A\nbody", { chunkSize: 99, overlapSize: 0 }),
    ).toThrow("Structured chunk size")
  })
})

describe("chunkKnowledgeDocument", () => {
  test("reports the strategy and the parameters actually used", () => {
    const options = { chunkSize: 1000, overlapSize: 200 }

    expect(
      chunkKnowledgeDocument({ kind: "prose", text: "alpha" }, options),
    ).toMatchObject({ strategy: "prose", chunkSize: 1000, overlapSize: 200 })
    expect(
      chunkKnowledgeDocument({ kind: "markdown", text: "# A\nbody" }, options),
    ).toMatchObject({ strategy: "markdown", chunkSize: 1000, overlapSize: 200 })
    expect(
      chunkKnowledgeDocument(
        {
          kind: "tabular",
          sheets: [{ name: "S", headers: ["A"], rows: [["1"]] }],
          truncated: false,
        },
        options,
      ),
    ).toMatchObject({ strategy: "tabular", chunkSize: 1000, overlapSize: 0 })
  })

  // process-ai-file fails the run on zero chunks instead of wiping the index.
  test.each([
    [
      "tabular without sheets",
      { kind: "tabular", sheets: [], truncated: false },
    ],
    ["empty prose", { kind: "prose", text: "" }],
    ["empty markdown", { kind: "markdown", text: "" }],
  ] as const)("yields no chunks for %s", (_label, document) => {
    expect(
      chunkKnowledgeDocument(document, { chunkSize: 1000, overlapSize: 200 })
        .chunks,
    ).toEqual([])
  })
})
