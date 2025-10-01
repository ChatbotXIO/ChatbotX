"use server"

// Helper function to get file path from relative path
export async function getFilePathFromRelative(
  relativePath: string,
): Promise<string> {
  // For MinIO, we use the path as-is since files are stored directly in MinIO
  // Try both with and without 'public/' prefix to see which one works
  const actualPath = relativePath

  // First try with the original path (including 'public/')
  await Promise.resolve()
  return actualPath
}
