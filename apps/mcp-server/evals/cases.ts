import { createHash } from "node:crypto"

export const EVAL_SEED = 20_260_923
export const EVAL_TIME = "2026-09-23T09:00:00+07:00"
export const EVAL_TIMEZONE = "Asia/Ho_Chi_Minh"

export type ExpectedOutcome = "complete" | "clarify"
export type Locale = "vi" | "vi-unaccented" | "colloquial" | "en" | "mixed"
export type ExposureMode = "default" | "meta-only"

export type ArgumentPredicate = {
  key: string
  value?: string | number | boolean
  includes?: string
}

export type EvalCase = {
  id: string
  domain: string
  family: string
  split: "tuning" | "holdout"
  locale: Locale
  prompt: string
  now: string
  timezone: string
  expectedOutcome: ExpectedOutcome
  expectedTools: string[]
  argumentPredicates: ArgumentPredicate[]
  forbiddenTools: string[]
}

type CaseFamily = Omit<
  EvalCase,
  "id" | "locale" | "prompt" | "now" | "timezone" | "split"
> & { prompts: Record<Locale, string> }

const variants: readonly Locale[] = [
  "vi",
  "vi-unaccented",
  "colloquial",
  "en",
  "mixed",
]

const complete = (
  definition: Omit<CaseFamily, "expectedOutcome">,
): CaseFamily => ({
  ...definition,
  expectedOutcome: "complete",
})

const clarify = (
  definition: Omit<CaseFamily, "expectedOutcome">,
): CaseFamily => ({
  ...definition,
  expectedOutcome: "clarify",
})

const families: CaseFamily[] = [
  complete({
    domain: "contacts",
    family: "contact-email-get",
    expectedTools: ["contacts_get"],
    argumentPredicates: [{ key: "identifier", includes: "email:" }],
    forbiddenTools: ["contacts_search", "contacts_find_by_custom_field"],
    prompts: {
      vi: "Tìm khách ada@example.com",
      "vi-unaccented": "Tim khach ada@example.com",
      colloquial: "coi Ada email nay",
      en: "Find ada@example.com",
      mixed: "find khách ada@example.com",
    },
  }),
  complete({
    domain: "contacts",
    family: "contact-phone-get",
    expectedTools: ["contacts_get"],
    argumentPredicates: [{ key: "identifier", includes: "phone:" }],
    forbiddenTools: ["contacts_search", "contacts_find_by_custom_field"],
    prompts: {
      vi: "Tìm khách số +841234567890",
      "vi-unaccented": "Tim khach so +841234567890",
      colloquial: "coi sđt này +841234567890",
      en: "Find phone +841234567890",
      mixed: "find khách phone +841234567890",
    },
  }),
  complete({
    domain: "contacts",
    family: "contact-name-get",
    expectedTools: ["contacts_list"],
    argumentPredicates: [],
    forbiddenTools: ["contacts_search", "contacts_find_by_custom_field"],
    prompts: {
      vi: "Tìm thông tin khách An",
      "vi-unaccented": "Tim thong tin khach An",
      colloquial: "coi khách An",
      en: "Find contact An",
      mixed: "find khách An info",
    },
  }),
  clarify({
    domain: "contacts",
    family: "contact-name-ambiguous",
    expectedTools: ["contacts_list"],
    argumentPredicates: [],
    forbiddenTools: [
      "contacts_update",
      "contacts_send_message",
      "contacts_delete",
    ],
    prompts: {
      vi: "Gửi tin cho khách An",
      "vi-unaccented": "Gui tin cho khach An",
      colloquial: "nhắn An đi",
      en: "Message An",
      mixed: "send cho An",
    },
  }),
  complete({
    domain: "tags",
    family: "tag-create",
    expectedTools: ["tags_create"],
    argumentPredicates: [],
    forbiddenTools: ["contacts_set_tags"],
    prompts: {
      vi: "Tạo nhãn VIP",
      "vi-unaccented": "Tao nhan VIP",
      colloquial: "thêm tag VIP",
      en: "Create VIP tag",
      mixed: "create nhãn VIP",
    },
  }),
  complete({
    domain: "tags",
    family: "contact-tag-add",
    expectedTools: ["contacts_add_tags_by_name"],
    argumentPredicates: [
      { key: "identifier", includes: "id:" },
      { key: "tags", includes: "VIP" },
    ],
    forbiddenTools: ["contacts_set_tags"],
    prompts: {
      vi: "Gắn VIP cho khách An",
      "vi-unaccented": "Gan VIP cho khach An",
      colloquial: "tag VIP cho An",
      en: "Add VIP to An",
      mixed: "add VIP cho An",
    },
  }),
  complete({
    domain: "tags",
    family: "contact-tag-remove",
    expectedTools: ["contacts_remove_tags"],
    argumentPredicates: [{ key: "tagIds" }],
    forbiddenTools: ["tags_delete", "contacts_set_tags"],
    prompts: {
      vi: "Gỡ nhãn VIP của Ada",
      "vi-unaccented": "Go nhan VIP cua Ada",
      colloquial: "bỏ tag VIP Ada",
      en: "Remove Ada's VIP tag",
      mixed: "remove VIP tag Ada",
    },
  }),
  complete({
    domain: "tags",
    family: "contact-tags-replace",
    expectedTools: ["contacts_set_tags"],
    argumentPredicates: [{ key: "tagIds" }],
    forbiddenTools: ["contacts_add_tags_by_name"],
    prompts: {
      vi: "Thay toàn bộ nhãn Ada thành VIP",
      "vi-unaccented": "Thay toan bo nhan Ada thanh VIP",
      colloquial: "reset tag Ada chỉ VIP",
      en: "Replace Ada tags with VIP",
      mixed: "replace tags Ada VIP",
    },
  }),
  complete({
    domain: "messages",
    family: "contact-email-send",
    expectedTools: ["contacts_send_message"],
    argumentPredicates: [
      { key: "identifier", includes: "email:" },
      { key: "text", includes: "hello" },
    ],
    forbiddenTools: ["contacts_trigger_auto_reply", "broadcasts_create"],
    prompts: {
      vi: "Gửi hello cho ada@example.com",
      "vi-unaccented": "Gui hello cho ada@example.com",
      colloquial: "nhắn hello Ada",
      en: "Send hello to ada@example.com",
      mixed: "send hello cho ada@example.com",
    },
  }),
  complete({
    domain: "messages",
    family: "conversation-reply",
    expectedTools: ["messages_create"],
    argumentPredicates: [{ key: "conversationId" }],
    forbiddenTools: ["contacts_send_message", "broadcasts_create"],
    prompts: {
      vi: "Trả lời hội thoại 41 là đã nhận",
      "vi-unaccented": "Tra loi hoi thoai 41 la da nhan",
      colloquial: "reply convo 41 đã nhận",
      en: "Reply to conversation 41",
      mixed: "reply hội thoại 41",
    },
  }),
  complete({
    domain: "messages",
    family: "contact-flow-send",
    expectedTools: ["contacts_send_flow"],
    argumentPredicates: [{ key: "flowId" }],
    forbiddenTools: ["contacts_subscribe_sequences"],
    prompts: {
      vi: "Gửi flow Tư vấn cho Ada",
      "vi-unaccented": "Gui flow Tu van cho Ada",
      colloquial: "bắn flow Tư vấn cho Ada",
      en: "Send Consulting flow to Ada",
      mixed: "send flow Tư vấn Ada",
    },
  }),
  complete({
    domain: "messages",
    family: "keyword-trigger",
    expectedTools: ["contacts_trigger_auto_reply"],
    argumentPredicates: [{ key: "keyword" }],
    forbiddenTools: ["contacts_send_message"],
    prompts: {
      vi: "Kích hoạt trả lời tự động từ khóa giá cho Ada",
      "vi-unaccented": "Kich hoat tra loi tu dong tu khoa gia cho Ada",
      colloquial: "trigger keyword giá Ada",
      en: "Trigger keyword price for Ada",
      mixed: "trigger từ khóa giá Ada",
    },
  }),
  complete({
    domain: "broadcasts",
    family: "broadcast-draft",
    expectedTools: ["broadcasts_create"],
    argumentPredicates: [],
    forbiddenTools: ["broadcasts_schedule", "broadcasts_send"],
    prompts: {
      vi: "Tạo nháp broadcast chào VIP",
      "vi-unaccented": "Tao nhap broadcast chao VIP",
      colloquial: "draft blast chào VIP",
      en: "Create a VIP broadcast draft",
      mixed: "create draft broadcast VIP",
    },
  }),
  complete({
    domain: "broadcasts",
    family: "broadcast-audience",
    expectedTools: ["broadcasts_get_audience"],
    argumentPredicates: [],
    forbiddenTools: ["broadcasts_create"],
    prompts: {
      vi: "Xem đối tượng broadcast 12",
      "vi-unaccented": "Xem doi tuong broadcast 12",
      colloquial: "audience broadcast 12",
      en: "Show broadcast 12 audience",
      mixed: "show audience broadcast 12",
    },
  }),
  complete({
    domain: "broadcasts",
    family: "broadcast-schedule",
    expectedTools: ["broadcasts_schedule"],
    argumentPredicates: [],
    forbiddenTools: ["broadcasts_send"],
    prompts: {
      vi: "Lên lịch broadcast 12 lúc 9 giờ mai",
      "vi-unaccented": "Len lich broadcast 12 luc 9 gio mai",
      colloquial: "schedule blast 12 mai 9h",
      en: "Schedule broadcast 12 tomorrow at 9",
      mixed: "schedule broadcast 12 mai 9h",
    },
  }),
  clarify({
    domain: "broadcasts",
    family: "broadcast-missing-content",
    expectedTools: [],
    argumentPredicates: [],
    forbiddenTools: [
      "broadcasts_create",
      "broadcasts_schedule",
      "broadcasts_send",
    ],
    prompts: {
      vi: "Gửi broadcast cho VIP",
      "vi-unaccented": "Gui broadcast cho VIP",
      colloquial: "blast VIP đi",
      en: "Send a VIP broadcast",
      mixed: "send broadcast VIP",
    },
  }),
  complete({
    domain: "flows",
    family: "flow-create",
    expectedTools: ["flows_create"],
    argumentPredicates: [],
    forbiddenTools: ["flows_publish"],
    prompts: {
      vi: "Tạo flow chào mừng đơn giản",
      "vi-unaccented": "Tao flow chao mung don gian",
      colloquial: "tạo flow welcome",
      en: "Create a simple welcome flow",
      mixed: "create flow chào mừng",
    },
  }),
  complete({
    domain: "flows",
    family: "flow-validate",
    expectedTools: ["flows_validate"],
    argumentPredicates: [],
    forbiddenTools: ["flows_publish"],
    prompts: {
      vi: "Kiểm tra flow 15 có hợp lệ",
      "vi-unaccented": "Kiem tra flow 15 co hop le",
      colloquial: "validate flow 15",
      en: "Validate flow 15",
      mixed: "validate flow 15 nhé",
    },
  }),
  complete({
    domain: "flows",
    family: "flow-publish",
    expectedTools: ["flows_publish"],
    argumentPredicates: [],
    forbiddenTools: ["flows_update_draft"],
    prompts: {
      vi: "Publish flow 15",
      "vi-unaccented": "Publish flow 15",
      colloquial: "đăng flow 15",
      en: "Publish flow 15",
      mixed: "publish flow 15",
    },
  }),
  complete({
    domain: "flows",
    family: "flow-draft-update",
    expectedTools: ["flows_update_draft"],
    argumentPredicates: [],
    forbiddenTools: ["flows_publish"],
    prompts: {
      vi: "Sửa bản nháp flow 15",
      "vi-unaccented": "Sua ban nhap flow 15",
      colloquial: "edit draft flow 15",
      en: "Update flow 15 draft",
      mixed: "update draft flow 15",
    },
  }),
  complete({
    domain: "sequences",
    family: "sequence-create",
    expectedTools: ["sequences_create"],
    argumentPredicates: [],
    forbiddenTools: ["contacts_subscribe_sequences"],
    prompts: {
      vi: "Tạo sequence chăm sóc mới",
      "vi-unaccented": "Tao sequence cham soc moi",
      colloquial: "tạo chuỗi nurture",
      en: "Create a nurture sequence",
      mixed: "create sequence chăm sóc",
    },
  }),
  complete({
    domain: "sequences",
    family: "sequence-step",
    expectedTools: ["sequences_upsert_step"],
    argumentPredicates: [{ key: "sequenceId" }],
    forbiddenTools: ["contacts_subscribe_sequences"],
    prompts: {
      vi: "Thêm bước chờ một ngày vào sequence 7",
      "vi-unaccented": "Them buoc cho mot ngay vao sequence 7",
      colloquial: "add delay 1 ngày sequence 7",
      en: "Add one-day delay to sequence 7",
      mixed: "add delay 1 ngày sequence 7",
    },
  }),
  complete({
    domain: "sequences",
    family: "sequence-subscribe",
    expectedTools: ["contacts_subscribe_sequences"],
    argumentPredicates: [
      { key: "identifier", includes: "id:" },
      { key: "sequenceIds" },
    ],
    forbiddenTools: ["sequences_delete"],
    prompts: {
      vi: "Đăng ký Ada vào sequence chăm sóc",
      "vi-unaccented": "Dang ky Ada vao sequence cham soc",
      colloquial: "subscribe Ada sequence nurture",
      en: "Subscribe Ada to nurture sequence",
      mixed: "subscribe Ada sequence chăm sóc",
    },
  }),
  complete({
    domain: "sequences",
    family: "sequence-unsubscribe",
    expectedTools: ["contacts_unsubscribe_sequences"],
    argumentPredicates: [
      { key: "identifier", includes: "id:" },
      { key: "sequenceIds" },
    ],
    forbiddenTools: ["sequences_delete"],
    prompts: {
      vi: "Hủy Ada khỏi sequence 7",
      "vi-unaccented": "Huy Ada khoi sequence 7",
      colloquial: "unsubscribe Ada sequence 7",
      en: "Unsubscribe Ada from sequence 7",
      mixed: "unsubscribe Ada sequence 7",
    },
  }),
  complete({
    domain: "keywords",
    family: "keyword-inbound",
    expectedTools: ["keywords_create"],
    argumentPredicates: [{ key: "type", value: "inbound" }],
    forbiddenTools: ["fb_comments_create"],
    prompts: {
      vi: "Khi khách nhắn giá thì chạy flow tư vấn",
      "vi-unaccented": "Khi khach nhan gia thi chay flow tu van",
      colloquial: "khách nhắn giá chạy tư vấn",
      en: "Run Consulting when customer says price",
      mixed: "customer nhắn giá run flow tư vấn",
    },
  }),
  complete({
    domain: "keywords",
    family: "keyword-outbound",
    expectedTools: ["keywords_create"],
    argumentPredicates: [{ key: "type", value: "outbound" }],
    forbiddenTools: ["fb_comments_create"],
    prompts: {
      vi: "Khi Page gửi báo giá thì chạy flow tư vấn",
      "vi-unaccented": "Khi Page gui bao gia thi chay flow tu van",
      colloquial: "page gửi báo giá chạy tư vấn",
      en: "Run Consulting when Page sends quote",
      mixed: "Page gửi quote run flow tư vấn",
    },
  }),
  complete({
    domain: "keywords",
    family: "keyword-outbound-disable",
    expectedTools: ["keywords_update_status"],
    argumentPredicates: [{ key: "type", value: "outbound" }],
    forbiddenTools: ["keywords_delete"],
    prompts: {
      vi: "Tắt rule outbound 8",
      "vi-unaccented": "Tat rule outbound 8",
      colloquial: "disable outbound rule 8",
      en: "Disable outbound keyword 8",
      mixed: "tắt outbound keyword 8",
    },
  }),
  clarify({
    domain: "keywords",
    family: "comment-automation-request",
    expectedTools: ["fb_comments_list_posts"],
    argumentPredicates: [],
    forbiddenTools: ["keywords_create"],
    prompts: {
      vi: "Tự trả lời bình luận trên bài X",
      "vi-unaccented": "Tu tra loi binh luan tren bai X",
      colloquial: "auto reply comment bài X",
      en: "Auto reply comments on post X",
      mixed: "auto reply bình luận post X",
    },
  }),
  complete({
    domain: "fb-comments",
    family: "comment-post-list",
    expectedTools: ["fb_comments_list_posts"],
    argumentPredicates: [],
    forbiddenTools: ["keywords_list"],
    prompts: {
      vi: "Liệt kê bài viết có thể chọn",
      "vi-unaccented": "Liet ke bai viet co the chon",
      colloquial: "list post để chọn",
      en: "List selectable posts",
      mixed: "list bài viết selectable",
    },
  }),
  complete({
    domain: "fb-comments",
    family: "comment-automation-get",
    expectedTools: ["fb_comments_get"],
    argumentPredicates: [],
    forbiddenTools: ["keywords_get"],
    prompts: {
      vi: "Xem automation comment 3",
      "vi-unaccented": "Xem automation comment 3",
      colloquial: "coi comment automation 3",
      en: "Show comment automation 3",
      mixed: "show comment automation 3",
    },
  }),
  complete({
    domain: "fb-comments",
    family: "comment-reply-update",
    expectedTools: ["fb_comments_update"],
    argumentPredicates: [],
    forbiddenTools: ["keywords_update"],
    prompts: {
      vi: "Đổi reply công khai automation 3",
      "vi-unaccented": "Doi reply cong khai automation 3",
      colloquial: "edit public reply comment 3",
      en: "Change public reply for automation 3",
      mixed: "update public reply automation 3",
    },
  }),
  complete({
    domain: "fb-comments",
    family: "comment-hide-update",
    expectedTools: ["fb_comments_update"],
    argumentPredicates: [{ key: "hideComments" }],
    forbiddenTools: ["keywords_update"],
    prompts: {
      vi: "Đổi điều kiện ẩn comment automation 3",
      "vi-unaccented": "Doi dieu kien an comment automation 3",
      colloquial: "edit hide comment 3",
      en: "Change hide comments for automation 3",
      mixed: "update hideComments automation 3",
    },
  }),
  complete({
    domain: "products",
    family: "product-list",
    expectedTools: ["products_list"],
    argumentPredicates: [],
    forbiddenTools: ["products_create"],
    prompts: {
      vi: "Liệt kê sản phẩm",
      "vi-unaccented": "Liet ke san pham",
      colloquial: "list products",
      en: "List products",
      mixed: "list sản phẩm",
    },
  }),
  complete({
    domain: "products",
    family: "product-get",
    expectedTools: ["products_get"],
    argumentPredicates: [],
    forbiddenTools: ["products_update"],
    prompts: {
      vi: "Xem variants và addons sản phẩm 4",
      "vi-unaccented": "Xem variants va addons san pham 4",
      colloquial: "coi product 4 variants",
      en: "Show product 4 variants and addons",
      mixed: "show sản phẩm 4 addons",
    },
  }),
  complete({
    domain: "products",
    family: "product-create",
    expectedTools: ["products_create"],
    argumentPredicates: [],
    forbiddenTools: ["products_update"],
    prompts: {
      vi: "Tạo sản phẩm Áo mới",
      "vi-unaccented": "Tao san pham Ao moi",
      colloquial: "create product Áo",
      en: "Create product Shirt",
      mixed: "create sản phẩm Áo",
    },
  }),
  complete({
    domain: "products",
    family: "product-rename",
    expectedTools: ["products_update"],
    argumentPredicates: [],
    forbiddenTools: [],
    prompts: {
      vi: "Đổi tên sản phẩm 4 thành Áo xanh",
      "vi-unaccented": "Doi ten san pham 4 thanh Ao xanh",
      colloquial: "rename product 4 Áo xanh",
      en: "Rename product 4 to Blue Shirt",
      mixed: "rename sản phẩm 4 Áo xanh",
    },
  }),
  complete({
    domain: "coupons",
    family: "coupon-topic-create",
    expectedTools: ["coupons_create_topic"],
    argumentPredicates: [],
    forbiddenTools: ["coupons_issue_coupon"],
    prompts: {
      vi: "Tạo nhóm coupon mùa hè",
      "vi-unaccented": "Tao nhom coupon mua he",
      colloquial: "create coupon topic hè",
      en: "Create summer coupon topic",
      mixed: "create topic coupon mùa hè",
    },
  }),
  complete({
    domain: "coupons",
    family: "coupon-list",
    expectedTools: ["coupons_list_coupons"],
    argumentPredicates: [],
    forbiddenTools: ["coupons_list_topics"],
    prompts: {
      vi: "Xem mã coupon đã cấp",
      "vi-unaccented": "Xem ma coupon da cap",
      colloquial: "list issued coupons",
      en: "List issued coupons",
      mixed: "list mã coupon",
    },
  }),
  complete({
    domain: "coupons",
    family: "coupon-issue",
    expectedTools: ["coupons_issue_coupon"],
    argumentPredicates: [{ key: "topicId" }, { key: "contactId" }],
    forbiddenTools: ["coupons_create_topic"],
    prompts: {
      vi: "Cấp coupon nhóm 2 cho Ada",
      "vi-unaccented": "Cap coupon nhom 2 cho Ada",
      colloquial: "issue topic 2 Ada",
      en: "Issue coupon topic 2 to Ada",
      mixed: "issue coupon group 2 Ada",
    },
  }),
  complete({
    domain: "coupons",
    family: "coupon-mark-used",
    expectedTools: ["coupons_mark_coupon_used"],
    argumentPredicates: [],
    forbiddenTools: ["coupons_issue_coupon"],
    prompts: {
      vi: "Đánh dấu coupon của Ada đã dùng",
      "vi-unaccented": "Danh dau coupon cua Ada da dung",
      colloquial: "mark Ada coupon used",
      en: "Mark Ada coupon used",
      mixed: "mark coupon Ada used",
    },
  }),
  complete({
    domain: "appointments",
    family: "appointment-next",
    expectedTools: ["appointments_list"],
    argumentPredicates: [{ key: "tab", value: "next" }],
    forbiddenTools: ["appointments_cancel"],
    prompts: {
      vi: "Xem lịch hẹn sắp tới",
      "vi-unaccented": "Xem lich hen sap toi",
      colloquial: "lịch tới",
      en: "Show upcoming appointments",
      mixed: "show lịch hẹn next",
    },
  }),
  complete({
    domain: "appointments",
    family: "appointment-book",
    expectedTools: ["appointments_book"],
    argumentPredicates: [
      { key: "calendarId" },
      { key: "contactId" },
      { key: "startAt" },
    ],
    forbiddenTools: ["appointments_cancel"],
    prompts: {
      vi: "Đặt lịch cho Ada 9 giờ sáng mai",
      "vi-unaccented": "Dat lich cho Ada 9 gio sang mai",
      colloquial: "book Ada mai 9h",
      en: "Book Ada tomorrow at 9",
      mixed: "book lịch Ada mai 9h",
    },
  }),
  complete({
    domain: "appointments",
    family: "appointment-cancel",
    expectedTools: ["appointments_cancel"],
    argumentPredicates: [],
    forbiddenTools: ["appointments_delete"],
    prompts: {
      vi: "Hủy lịch hẹn 99",
      "vi-unaccented": "Huy lich hen 99",
      colloquial: "cancel appointment 99",
      en: "Cancel appointment 99",
      mixed: "cancel lịch hẹn 99",
    },
  }),
  clarify({
    domain: "appointments",
    family: "appointment-unavailable",
    expectedTools: ["appointments_book"],
    argumentPredicates: [],
    forbiddenTools: [],
    prompts: {
      vi: "Đặt lịch Ada lúc nửa đêm",
      "vi-unaccented": "Dat lich Ada luc nua dem",
      colloquial: "book Ada midnight",
      en: "Book Ada at midnight",
      mixed: "book lịch Ada midnight",
    },
  }),
  complete({
    domain: "analytics",
    family: "analytics-new",
    expectedTools: ["analytics_new_contacts_count"],
    argumentPredicates: [
      { key: "from" },
      { key: "to" },
      { key: "timezone", value: EVAL_TIMEZONE },
    ],
    forbiddenTools: ["analytics_contacts_count"],
    prompts: {
      vi: "Có bao nhiêu khách mới hôm nay",
      "vi-unaccented": "Co bao nhieu khach moi hom nay",
      colloquial: "new contacts hôm nay",
      en: "How many new contacts today",
      mixed: "bao nhiêu new contacts hôm nay",
    },
  }),
  complete({
    domain: "analytics",
    family: "analytics-total",
    expectedTools: ["analytics_contacts_count"],
    argumentPredicates: [
      { key: "from" },
      { key: "to" },
      { key: "timezone", value: EVAL_TIMEZONE },
    ],
    forbiddenTools: ["analytics_new_contacts_count"],
    prompts: {
      vi: "Tổng số khách tuần này",
      "vi-unaccented": "Tong so khach tuan nay",
      colloquial: "total contacts tuần này",
      en: "Total contacts this week",
      mixed: "total khách tuần này",
    },
  }),
  complete({
    domain: "analytics",
    family: "analytics-active",
    expectedTools: ["analytics_active_contacts_count"],
    argumentPredicates: [
      { key: "from" },
      { key: "to" },
      { key: "timezone", value: EVAL_TIMEZONE },
    ],
    forbiddenTools: ["analytics_contacts_count"],
    prompts: {
      vi: "Khách active tuần này",
      "vi-unaccented": "Khach active tuan nay",
      colloquial: "active contacts tuần",
      en: "Active contacts this week",
      mixed: "active khách tuần này",
    },
  }),
  complete({
    domain: "analytics",
    family: "analytics-channel",
    expectedTools: ["analytics_contacts_by_dimension"],
    argumentPredicates: [
      { key: "dimension", value: "channel" },
      { key: "from" },
      { key: "to" },
      { key: "timezone", value: EVAL_TIMEZONE },
    ],
    forbiddenTools: [],
    prompts: {
      vi: "Phân khách theo channel tuần này",
      "vi-unaccented": "Phan khach theo channel tuan nay",
      colloquial: "contacts by channel",
      en: "Contacts by channel this week",
      mixed: "contacts theo channel tuần này",
    },
  }),
]

const splitFor = (family: string): "tuning" | "holdout" => {
  const byte = createHash("sha256").update(`${EVAL_SEED}:${family}`).digest()[0]
  return byte % 4 === 0 ? "holdout" : "tuning"
}

export const materializeCases = (): EvalCase[] =>
  families.flatMap((definition) =>
    variants.map((locale) => ({
      ...definition,
      id: `${definition.family}-${locale}`,
      locale,
      prompt: definition.prompts[locale],
      now: EVAL_TIME,
      timezone: EVAL_TIMEZONE,
      split: splitFor(definition.family),
    })),
  )

export const corpusHash = (cases: EvalCase[]): string =>
  createHash("sha256").update(JSON.stringify(cases)).digest("hex")

export const safetyCases = (cases: EvalCase[]): EvalCase[] => {
  const domains = new Set<string>()
  return cases.filter((evalCase) => {
    if (evalCase.locale !== "vi" || domains.has(evalCase.domain)) {
      return false
    }
    domains.add(evalCase.domain)
    return true
  })
}
