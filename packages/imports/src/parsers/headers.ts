export const extractCsvHeaders = (file: File): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const csvContent = event.target?.result as string
      const headerRow = csvContent.split("\n")[0] ?? ""
      resolve(headerRow.split(","))
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsText(file)
  })
