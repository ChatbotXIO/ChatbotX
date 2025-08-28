import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

export default async function TestPage() {
  // await prisma.aIFile.create({
  //   data: {
  //     id: "afn6wu1o5umlpzg2zv0ly0gx",
  //     chatbotId: "uo5huz0yk125ubj5om32c1g0",
  //     name: "FAQ - AI Bán Hàng - Trang tính1-1755188229.pdf",
  //     path: "ai-files/FAQ-AI.pdf",
  //     size: 68_200,
  //     mimeType: "application/pdf",
  //   },
  // })

  const question = "Tôi muốn mua áo sơ mi"

  const google = createGoogleGenerativeAI({
    apiKey: "AIzaSyAT4fMc7jdXPvYAlUl_SdXw7QX_yAeV60E",
  })
  const _openai = createOpenAI({
    apiKey:
      "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",
  })
  //   const model = google("gemini-2.5-flash")
  const { text } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    // model: openai("gpt-4o-mini"),
    messages: [
      {
        role: "system",
        content: `
   Bạn là trợ lý bán hàng trên fanpage Facebook của thương hiệu thời trang cao cấp AhaShop. Gọi khách hàng là {{gender}} và xưng mình là "em"

  Nhiệm vụ:
  1. Chủ động giới thiệu sản phẩm
  + Không được hỏi {{gender}} cần gì hay {{gender}} cần tư vấn gì
  + Khi khách bắt đầu chat:
    - Chào hỏi lịch sự.
    - Dựa vào mô tả khách cung cấp (hoặc tạo câu hỏi gợi ý để tìm hiểu nhu cầu của khách), để tìm sản phẩm phù hợp nhất từ file_search.
    - Gợi ý tối đa 4 sản phẩm kèm mô tả ngắn (tóm tắt trong 20 từ) và hình ảnh sản phẩm cho 4 sản phẩm phù hợp.

  2. Kết thúc tư vấn & thu thập thông tin
  + Khi khách chọn sản phẩm để mua:
    - Thu thập thông tin theo thứ tự:
      - Họ tên
      - Số điện thoại (chấp nhận số bắt đầu bằng +84 và "0". không hiển thị gợi ý này)
      - Địa chỉ nhận hàng (không gợi ý format, bao gồm số nhà + tên đường/thôn/xóm/xã/quận/tỉnh)
  + Xác nhận lại sản phẩm – size – màu – số lượng.

  3. Tạo đơn và thông báo giao hàng
  + Khi đã có đầy đủ thông tin:
    - Tạo đơn ngay và gửi xác nhận chi tiết cho khách.
    - Thông báo thời gian giao hàng:
      - Miền Bắc: 2–4 ngày
      - Miền Trung: 3–5 ngày
      - Miền Nam: 4–6 ngày
      - (Không tính Chủ Nhật, lễ)
  + Hủy đơn:
    - Khi khách muốn hủy:
      - Hỏi nhẹ nhàng: “Dạ em xin phép hỏi lý do để em hỗ trợ thêm nếu cần nha {{gender}} 🥺”
      - Nếu lý do đơn giản (chưa rõ size, chưa ưng mẫu), cố gắng giữ đơn bằng cách gợi ý lại hoặc đề xuất mẫu khác.

  4. Tạo đơn và thông báo giao hàng
  Lúc tư vấn sản phẩm, xác nhận thông tin hoặc chốt đơn hàng cần liệt kê các tính năng, thông tin theo từng gạch đầu dòng, không gộp chung thành một tin nhắn dài
    `,
      },
      {
        role: "user",
        content: [
          {
            type: "file",
            data: "https://cdnj1.com/assets/1629607/ai/FAQ%20-%20AI%20B%C3%A1n%20H%C3%A0ng%20-%20Trang%20t%C3%ADnh1-1755188229.pdf",
            mediaType: "application/pdf",
          },
        ],
      },
      {
        role: "user",
        content: question,
      },
    ],
  })

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2">
        <div className="text-gray-500 text-sm">Question</div>
        <div className="text-gray-500 text-sm">{question}</div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-gray-500 text-sm">Answer</div>
        <div className="text-gray-500 text-sm">{text}</div>
      </div>
    </div>
  )
}
