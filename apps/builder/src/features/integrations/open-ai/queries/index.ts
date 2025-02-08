export const getOpenAIIntegration = async ({
  chatbotId,
}: { chatbotId: string }): Promise<{
  data: Record<string, string | boolean> | null
}> => {
  return {
    data: {
      isConnect: true,
    },
  }
}

export const getOpenAIModels = async (): Promise<{
  data: Record<string, string | number>[]
  status: string
}> => {
  return {
    data: [
      {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        maxlength: 375000,
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo 16K",
        maxlength: 48000,
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        maxlength: 375000,
      },
      {
        id: "o1-preview",
        name: "o1-preview",
        maxlength: 375000,
      },
      {
        id: "o1-mini",
        name: "o1-mini",
        maxlength: 375000,
      },
    ],
    status: "ok",
  }
}

export const getOpenAITriggers = async (): Promise<{
  data: Record<string, string>[]
  status: string
}> => {
  return {
    data: [
      {
        id: "1859361",
        page_id: "0",
        name: "connect_user_to_human",
        active: "1",
        description:
          "Allows the user to speak, talk or contact a human agent or team. This function will connect the user to a human agent.",
        final_text:
          "We handed over the conversation to a human agent. We will get back to you as soon as possible.",
        json_builder: "",
      },
      {
        id: "572014",
        page_id: "1862052",
        name: "dat_lich",
        active: "1",
        description: "",
        final_text: "Bạn đã đặt lịch hẹn thành công.",
        json_builder: "",
      },
      {
        id: "1093414",
        page_id: "1862052",
        name: "mua_hang",
        active: "1",
        description: "cho phép người dùng mua hàng",
        final_text: "Đơn hàng của bạn đã được xác nhận",
        json_builder: "",
      },
    ],
    status: "ok",
  }
}
