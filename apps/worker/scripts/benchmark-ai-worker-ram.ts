import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Readability } from "@mozilla/readability"
import { htmlToText } from "html-to-text"
import JSZip from "jszip"
import { parseHTML } from "linkedom"
import { extractRawText } from "mammoth"
import pdfParse from "pdf-parse-new"
import { read as readWorkbook, utils, write as writeWorkbook } from "xlsx"

type ScenarioResult = {
  id: string
  name: string
  durationMs: number
  baselineMb: number
  peakMb: number
  settledMb: number
  deltaMb: number
  notes: string
}

type Scenario = {
  id: string
  name: string
  run: (
    checkpoint: () => void,
  ) => Promise<string | undefined> | string | undefined
}

const MB = 1024 * 1024
const repoRoot = process.cwd()

function rssMb(): number {
  return process.memoryUsage().rss / MB
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  global.gc?.()
  await new Promise((resolve) => setTimeout(resolve, 50))
}

function makeRepeatedText(sizeMb: number): string {
  const chunk =
    "Customer asks about order status, product detail, pricing, and support policy. "
  const target = sizeMb * MB
  return chunk.repeat(Math.ceil(target / chunk.length)).slice(0, target)
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .trim()
}

function createSyntheticDocx(sizeMb: number): Promise<Buffer> {
  const zip = new JSZip()
  const text = makeRepeatedText(sizeMb)
  zip.file(
    "[Content_Types].xml",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      "</Types>",
    ].join(""),
  )
  zip.file(
    "_rels/.rels",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
      "</Relationships>",
    ].join(""),
  )
  zip.file(
    "word/document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      ...(text.match(/.{1,2000}/g) ?? []).map(
        (part) => `<w:p><w:r><w:t>${part}</w:t></w:r></w:p>`,
      ),
      "</w:body></w:document>",
    ].join(""),
  )
  return zip.generateAsync({ type: "nodebuffer" })
}

function createSyntheticXlsx(rows: number, cols: number): Buffer {
  const data = Array.from({ length: rows }, (_, rowIndex) => {
    const row: Record<string, string> = {}
    for (let colIndex = 0; colIndex < cols; colIndex++) {
      row[`field_${colIndex}`] =
        `row ${rowIndex} column ${colIndex} value ${"x".repeat(120)}`
    }
    return row
  })
  const sheet = utils.json_to_sheet(data)
  const book = utils.book_new()
  utils.book_append_sheet(book, sheet, "Data")
  return writeWorkbook(book, { type: "buffer", bookType: "xlsx" }) as Buffer
}

const scenarios: Scenario[] = [
  {
    id: "B1",
    name: "idle node baseline",
    run: () => "process baseline after imports",
  },
  {
    id: "I1",
    name: "integration light payload x20",
    run: async (checkpoint) => {
      const jobs = Array.from({ length: 20 }, (_, index) => ({
        type: "incomingMessage",
        data: {
          integrationType: "messenger",
          integrationIdentifier: `page-${index}`,
          payload: { message: "hello", contact: `contact-${index}` },
        },
      }))
      checkpoint()
      await Promise.all(jobs.map((job) => Promise.resolve(JSON.stringify(job))))
      checkpoint()
      return "simulated routing payloads only"
    },
  },
  {
    id: "R1",
    name: "AI text reply short x3",
    run: (checkpoint) => {
      const replies = Array.from({ length: 3 }, (_, index) => {
        const messages = [
          { role: "user", content: `hello ${index}` },
          { role: "assistant", content: "How can I help?" },
        ]
        const output = makeRepeatedText(0.05)
        checkpoint()
        return JSON.stringify({ messages, output })
      })
      checkpoint()
      return `generated ${replies.join("").length} chars locally`
    },
  },
  {
    id: "R2",
    name: "AI text reply 100-message history x3",
    run: (checkpoint) => {
      const runs = Array.from({ length: 3 }, (_, runIndex) => {
        const messages = Array.from({ length: 100 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `${runIndex}:${index}: ${makeRepeatedText(0.01)}`,
        }))
        checkpoint()
        return JSON.stringify(messages)
      })
      checkpoint()
      return `serialized ${runs.join("").length} chars`
    },
  },
  {
    id: "T3",
    name: "URL reader parse 500KB HTML x3",
    run: (checkpoint) => {
      for (let i = 0; i < 3; i++) {
        const html = `<html><body><article><h1>Policy</h1><p>${makeRepeatedText(
          0.5,
        )}</p></article></body></html>`
        const { document } = parseHTML(html, "https://example.com")
        checkpoint()
        const article = new Readability(document as unknown as Document).parse()
        const text = article?.textContent?.trim() || htmlToText(html)
        normalizeWhitespace(text).slice(0, 200_000)
        checkpoint()
      }
      return "linkedom + readability + html-to-text"
    },
  },
  {
    id: "D1",
    name: "PDF parse existing appointment PDF",
    run: async (checkpoint) => {
      const file = join(repoRoot, "plans/Tính năng Appointment Scheduling.pdf")
      const buffer = await readFile(file)
      checkpoint()
      const parsed = await pdfParse(buffer)
      checkpoint()
      return `input ${Math.round(buffer.length / MB)}MB, text ${parsed.text.length} chars`
    },
  },
  {
    id: "D2",
    name: "DOCX parse synthetic compressed",
    run: async (checkpoint) => {
      const buffer = await createSyntheticDocx(3)
      checkpoint()
      const parsed = await extractRawText({ buffer })
      normalizeWhitespace(parsed.value || "")
      checkpoint()
      return `zip ${Math.round(buffer.length / MB)}MB, text ${parsed.value.length} chars`
    },
  },
  {
    id: "D3",
    name: "XLSX parse synthetic 20k x 8",
    run: (checkpoint) => {
      const buffer = createSyntheticXlsx(20_000, 8)
      checkpoint()
      const workbook = readWorkbook(buffer, { type: "buffer" })
      const rows = workbook.SheetNames.flatMap((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        return sheet ? utils.sheet_to_json<Record<string, unknown>>(sheet) : []
      })
      checkpoint()
      return `xlsx ${Math.round(buffer.length / MB)}MB, rows ${rows.length}`
    },
  },
  {
    id: "S1",
    name: "speech-to-text buffer simulation 25MB x1",
    run: (checkpoint) => {
      const audio = Buffer.alloc(25 * MB, 1)
      checkpoint()
      const providerPayload = new Uint8Array(audio)
      checkpoint()
      return `audio ${Math.round(providerPayload.byteLength / MB)}MB`
    },
  },
  {
    id: "M2",
    name: "image reader buffer simulation 10MB x2",
    run: (checkpoint) => {
      const images = Array.from({ length: 2 }, () => Buffer.alloc(10 * MB, 2))
      checkpoint()
      const payloads = images.map((image) => new Uint8Array(image))
      checkpoint()
      const totalMb =
        payloads.reduce((sum, item) => sum + item.byteLength, 0) / MB
      return `images ${payloads.length}, total ${totalMb}MB`
    },
  },
  {
    id: "M4",
    name: "generate image payload simulation 10MB x1",
    run: (checkpoint) => {
      const base64 = Buffer.alloc(10 * MB, 3).toString("base64")
      checkpoint()
      const output = Buffer.from(base64, "base64")
      checkpoint()
      return `base64 ${Math.round(base64.length / MB)}MB, output ${Math.round(
        output.length / MB,
      )}MB`
    },
  },
  {
    id: "A2",
    name: "embedding vector simulation x20",
    run: (checkpoint) => {
      const embeddings = Array.from({ length: 20 }, () =>
        Array.from({ length: 3072 }, (_, index) => Math.sin(index)),
      )
      checkpoint()
      const serialized = embeddings.map(
        (embedding) => `[${embedding.join(",")}]`,
      )
      checkpoint()
      return `vectors ${embeddings.length}, serialized ${Math.round(
        serialized.join("").length / MB,
      )}MB`
    },
  },
]

async function runScenario(id: string) {
  const scenario = scenarios.find((item) => item.id === id)
  if (!scenario) {
    throw new Error(`Unknown scenario ${id}`)
  }

  await settle()
  const baseline = rssMb()
  let peak = baseline
  const checkpoint = () => {
    peak = Math.max(peak, rssMb())
  }
  const startedAt = performance.now()
  let notes = ""
  try {
    const maybeNotes = await scenario.run(checkpoint)
    if (maybeNotes) {
      notes = maybeNotes
    }
  } catch (error) {
    notes = `error: ${error instanceof Error ? error.message : String(error)}`
  }
  checkpoint()
  const durationMs = performance.now() - startedAt
  await settle()
  const settled = rssMb()
  peak = Math.max(peak, settled)
  const result: ScenarioResult = {
    id: scenario.id,
    name: scenario.name,
    durationMs,
    baselineMb: baseline,
    peakMb: peak,
    settledMb: settled,
    deltaMb: peak - baseline,
    notes,
  }
  console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`)
}

/**
 * Runs `concurrency` scenario instances concurrently in one process, cycling
 * through `ids` round-robin -- this is what a BullMQ `concurrency` slot count
 * actually does (N jobs in flight in the same process), unlike `runScenario`
 * which measures one job in isolation. Use this to reproduce a real
 * concurrency-driven OOM instead of a single-job peak.
 */
async function runBurst(ids: string[], concurrency: number) {
  const found = Array.from({ length: concurrency }, (_, i) => {
    const id = ids[i % ids.length]
    const scenario = scenarios.find((item) => item.id === id)
    if (!scenario) {
      throw new Error(`Unknown scenario ${id}`)
    }
    return scenario
  })

  await settle()
  const baseline = rssMb()
  let peak = baseline
  const checkpoint = () => {
    peak = Math.max(peak, rssMb())
  }
  // Independent sampler, since concurrent jobs' own checkpoint() calls can
  // cluster or miss the true cross-job peak.
  const samplerHandle = setInterval(checkpoint, 100)

  const startedAt = performance.now()
  const outcomes = await Promise.allSettled(
    found.map((scenario) => scenario.run(checkpoint)),
  )
  checkpoint()
  const durationMs = performance.now() - startedAt

  clearInterval(samplerHandle)
  await settle()
  const settled = rssMb()
  peak = Math.max(peak, settled)

  const errors = outcomes.filter((o) => o.status === "rejected").length
  const summary = {
    mode: "burst",
    scenarios: found.map((s) => s.id),
    concurrency,
    durationMs,
    baselineMb: baseline,
    peakMb: peak,
    settledMb: settled,
    deltaMb: peak - baseline,
    errors,
  }
  console.log(`BENCHMARK_BURST_RESULT ${JSON.stringify(summary)}`)
}

const mode = process.argv[2]
if (mode === "burst") {
  const ids = (process.argv[3] ?? "").split(",").filter(Boolean)
  const concurrency = Number.parseInt(process.argv[4] ?? "", 10)
  if (ids.length === 0 || !Number.isFinite(concurrency) || concurrency < 1) {
    console.error(
      "Usage: benchmark-ai-worker-ram.ts burst <id1,id2,...> <concurrency>",
    )
    process.exit(1)
  }
  runBurst(ids, concurrency).catch((error) => {
    console.error(error)
    process.exit(1)
  })
} else if (mode) {
  runScenario(mode).catch((error) => {
    console.error(error)
    process.exit(1)
  })
} else {
  console.log("Run one scenario per process for isolated RSS measurement.")
  console.log(
    `Scenario IDs: ${scenarios.map((scenario) => scenario.id).join(" ")}`,
  )
  console.log(
    "Example: node --expose-gc --import tsx apps/worker/scripts/benchmark-ai-worker-ram.ts B1",
  )
  console.log("Burst mode (simulates N concurrent BullMQ jobs in one process):")
  console.log(
    "Example: node --expose-gc --import tsx apps/worker/scripts/benchmark-ai-worker-ram.ts burst D2,D3,S1,M2,M4 10",
  )
}
