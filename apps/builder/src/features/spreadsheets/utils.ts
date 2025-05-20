const SPREADSHEET_ID_REGEX = /\/d\/([a-zA-Z0-9-_]+)/

export const parseSpreadsheetId = (url: string) => {
  const match = url.match(SPREADSHEET_ID_REGEX)

  return match ? match[1] : null
}
