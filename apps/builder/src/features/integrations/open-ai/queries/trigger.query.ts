export const getTriggers = async (): Promise<{
  data: Record<string, string>[]
  status: string
}> => {
  return {
    data: [
      {
        id: "1",
        page_id: "0",
        name: "connect_user_to_human",
        active: "1",
        description:
          "Allows the user to speak, talk or contact a human agent or team. This function will connect the user to a human agent.",
        final_text:
          "We handed over the conversation to a human agent. We will get back to you as soon as possible.",
        json_builder: "",
      },
    ],
    status: "ok",
  }
}
