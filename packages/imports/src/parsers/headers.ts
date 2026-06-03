const NEWLINE_RE = /\r?\n/

/**
 * Parses a single CSV line per RFC 4180: fields may be wrapped in double
 * quotes, embedded quotes are doubled (`""`), and commas/quotes inside a
 * quoted field are treated as literal text rather than delimiters.
 */
export const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      fields.push(current)
      current = ""
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields.map((field) => field.trim())
}

// M-3: Read only the first 4 KB — enough for any realistic header row —
// instead of loading the entire (potentially 20 MB) CSV into memory.
export const extractCsvHeaders = (file: File): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const csvContent = event.target?.result as string
      const headerRow = csvContent.split(NEWLINE_RE)[0] ?? ""
      resolve(parseCsvLine(headerRow))
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsText(file.slice(0, 4096))
  })
