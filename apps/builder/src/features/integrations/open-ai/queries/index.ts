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

export const getOpenAIFlows = async (): Promise<{
  data: { label: string; value: string }[]
  status: string
}> => {
  return {
    data: [
      {
        value: "1574158495539",
        label: "Send Message Mặc Định",
      },
      {
        value: "1736560774315",
        label: "test cho Hòa",
      },
      {
        value: "1731605313909",
        label: "Thẻ ảnh",
      },
      {
        value: "1731586359615",
        label: "test",
      },
      {
        value: "1738057398846",
        label: "input text",
      },
      {
        value: "1735302954788",
        label: "genimi",
      },
      {
        value: "1733146526800",
        label: "test ai",
      },
      {
        value: "1730029128394",
        label: "sent email",
      },
      {
        value: "1733233936317",
        label: "coze",
      },
      {
        value: "1733755607001",
        label: "testflow1",
      },
      {
        value: "1731605365507",
        label: "Carousel",
      },
      {
        value: "1731729632933",
        label: "google sheets",
      },
      {
        value: "1723624061759",
        label: "chào mừng",
      },
      {
        value: "1731384395126",
        label: "website chào mừng",
      },
      {
        value: "1731401946321",
        label: "sản phẩm",
      },
      {
        value: "1729051691859",
        label: "chào mừng - copy",
      },
      {
        value: "1730185206342",
        label: "Messenger List",
      },
      {
        value: "1728531534146",
        label: "kb telegram",
      },
      {
        value: "1724044305769",
        label: "Nhắc lịch hẹn",
      },
      {
        value: "1724043583739",
        label: "đặt lịch",
      },
      {
        value: "15",
        label: "SYSTEM - List of frequently asked questions",
      },
      {
        value: "1576863921991",
        label: "Referral - Check if the user win reward",
      },
      {
        value: "1576864852750",
        label: "Referral - Give the user a unique link to share",
      },
      {
        value: "1580814690301",
        label: "Referral - See Points",
      },
    ],
    status: "ok",
  }
}
export const getOpenAIFields = async (): Promise<{
  data: { label: string; value: string }[]
  status: string
}> => {
  return {
    data: [
      {
        value: "521448",
        label: "1",
      },
      {
        value: "515034",
        label: "3",
      },
      {
        value: "927550",
        label: "account field 1",
      },
      {
        value: "581013",
        label: "chatgpt response",
      },
      {
        value: "546401",
        label: "daytime",
      },
      {
        value: "910473",
        label: "diachi",
      },
      {
        value: "855023",
        label: "gemini response",
      },
      {
        value: "714221",
        label: "hoten",
      },
      {
        value: "58081",
        label: "kytu",
      },
      {
        value: "914860",
        label: "lichhen",
      },
      {
        value: "402201",
        label: "phong1",
      },
      {
        value: "542467",
        label: "sodienthoai",
      },
      {
        value: "933928",
        label: "total_bill",
      },
      {
        value: "577",
        label: "total_user_referred",
      },
      {
        value: "110143",
        label: "user_input",
      },
    ],
    status: "ok",
  }
}
