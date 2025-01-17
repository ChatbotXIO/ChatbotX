export const getGoogleSheetsIntegration = async ({
  chatbotId,
}: { chatbotId: string }): Promise<{ data: Record<string, string> | null }> => {
  return {
    data: {
      ok: "true",
    },
  }
}
