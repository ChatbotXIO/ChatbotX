export type PollBotStrings = {
  vote: string
  polls: string
  votingStarted: string
  votingIsOver: string
  votingStartsSoon: string
  voteRegistered: string
  noOpenPolls: string
}

const FALLBACK_LOCALE = "en"
const LOCALE_SEPARATOR = /[-_]/

const POLL_BOT_STRINGS: Record<string, PollBotStrings> = {
  en: {
    vote: "Vote",
    polls: "Polls",
    votingStarted: "Voting started",
    votingIsOver: "Voting is over",
    votingStartsSoon: "Voting starts soon",
    voteRegistered: "Your vote was successfully registered.",
    noOpenPolls: "No polls are open right now.",
  },
  ar: {
    vote: "صوّت",
    polls: "الاستطلاعات",
    votingStarted: "بدأ التصويت",
    votingIsOver: "انتهى التصويت",
    votingStartsSoon: "سيبدأ التصويت قريبًا",
    voteRegistered: "تم تسجيل صوتك بنجاح.",
    noOpenPolls: "لا توجد استطلاعات مفتوحة حاليًا.",
  },
  az: {
    vote: "Səs ver",
    polls: "Sorğular",
    votingStarted: "Səsvermə başladı",
    votingIsOver: "Səsvermə başa çatdı",
    votingStartsSoon: "Səsvermə tezliklə başlayır",
    voteRegistered: "Səsiniz uğurla qeydə alındı.",
    noOpenPolls: "Hazırda açıq sorğu yoxdur.",
  },
  da: {
    vote: "Stem",
    polls: "Afstemninger",
    votingStarted: "Afstemningen er startet",
    votingIsOver: "Afstemningen er slut",
    votingStartsSoon: "Afstemningen starter snart",
    voteRegistered: "Din stemme er blevet registreret.",
    noOpenPolls: "Der er ingen åbne afstemninger lige nu.",
  },
  de: {
    vote: "Abstimmen",
    polls: "Umfragen",
    votingStarted: "Abstimmung gestartet",
    votingIsOver: "Abstimmung beendet",
    votingStartsSoon: "Abstimmung beginnt bald",
    voteRegistered: "Deine Stimme wurde erfolgreich registriert.",
    noOpenPolls: "Derzeit sind keine Umfragen offen.",
  },
  es: {
    vote: "Votar",
    polls: "Encuestas",
    votingStarted: "Votación iniciada",
    votingIsOver: "La votación ha terminado",
    votingStartsSoon: "La votación comienza pronto",
    voteRegistered: "Tu voto se registró correctamente.",
    noOpenPolls: "No hay encuestas abiertas en este momento.",
  },
  fi: {
    vote: "Äänestä",
    polls: "Äänestykset",
    votingStarted: "Äänestys alkoi",
    votingIsOver: "Äänestys on päättynyt",
    votingStartsSoon: "Äänestys alkaa pian",
    voteRegistered: "Äänesi on rekisteröity onnistuneesti.",
    noOpenPolls: "Avoimia äänestyksiä ei ole juuri nyt.",
  },
  fr: {
    vote: "Voter",
    polls: "Sondages",
    votingStarted: "Vote commencé",
    votingIsOver: "Le vote est terminé",
    votingStartsSoon: "Le vote commence bientôt",
    voteRegistered: "Votre vote a bien été enregistré.",
    noOpenPolls: "Aucun sondage n'est ouvert pour le moment.",
  },
  he: {
    vote: "הצבע",
    polls: "סקרים",
    votingStarted: "ההצבעה החלה",
    votingIsOver: "ההצבעה הסתיימה",
    votingStartsSoon: "ההצבעה תתחיל בקרוב",
    voteRegistered: "ההצבעה שלך נרשמה בהצלחה.",
    noOpenPolls: "אין סקרים פתוחים כרגע.",
  },
  id: {
    vote: "Pilih",
    polls: "Polling",
    votingStarted: "Pemungutan suara dimulai",
    votingIsOver: "Pemungutan suara telah berakhir",
    votingStartsSoon: "Pemungutan suara segera dimulai",
    voteRegistered: "Suara Anda berhasil dicatat.",
    noOpenPolls: "Tidak ada polling yang terbuka saat ini.",
  },
  it: {
    vote: "Vota",
    polls: "Sondaggi",
    votingStarted: "Votazione iniziata",
    votingIsOver: "La votazione è terminata",
    votingStartsSoon: "La votazione inizia presto",
    voteRegistered: "Il tuo voto è stato registrato con successo.",
    noOpenPolls: "Al momento non ci sono sondaggi aperti.",
  },
  ja: {
    vote: "投票",
    polls: "投票一覧",
    votingStarted: "投票開始",
    votingIsOver: "投票は終了しました",
    votingStartsSoon: "まもなく投票開始",
    voteRegistered: "投票を受け付けました。",
    noOpenPolls: "現在受付中の投票はありません。",
  },
  nl: {
    vote: "Stemmen",
    polls: "Peilingen",
    votingStarted: "Stemmen gestart",
    votingIsOver: "Het stemmen is voorbij",
    votingStartsSoon: "Stemmen begint binnenkort",
    voteRegistered: "Je stem is succesvol geregistreerd.",
    noOpenPolls: "Er zijn momenteel geen open peilingen.",
  },
  "pt-BR": {
    vote: "Votar",
    polls: "Enquetes",
    votingStarted: "Votação iniciada",
    votingIsOver: "A votação terminou",
    votingStartsSoon: "A votação começa em breve",
    voteRegistered: "Seu voto foi registrado com sucesso.",
    noOpenPolls: "Não há enquetes abertas no momento.",
  },
  "pt-PT": {
    vote: "Votar",
    polls: "Sondagens",
    votingStarted: "Votação iniciada",
    votingIsOver: "A votação terminou",
    votingStartsSoon: "A votação começa em breve",
    voteRegistered: "O seu voto foi registado com sucesso.",
    noOpenPolls: "Não há sondagens abertas neste momento.",
  },
  ro: {
    vote: "Votează",
    polls: "Sondaje",
    votingStarted: "Votul a început",
    votingIsOver: "Votul s-a încheiat",
    votingStartsSoon: "Votul începe în curând",
    voteRegistered: "Votul tău a fost înregistrat cu succes.",
    noOpenPolls: "Momentan nu există sondaje deschise.",
  },
  sv: {
    vote: "Rösta",
    polls: "Omröstningar",
    votingStarted: "Omröstningen har startat",
    votingIsOver: "Omröstningen är avslutad",
    votingStartsSoon: "Omröstningen startar snart",
    voteRegistered: "Din röst har registrerats.",
    noOpenPolls: "Det finns inga öppna omröstningar just nu.",
  },
  tr: {
    vote: "Oy ver",
    polls: "Anketler",
    votingStarted: "Oylama başladı",
    votingIsOver: "Oylama sona erdi",
    votingStartsSoon: "Oylama yakında başlıyor",
    voteRegistered: "Oyunuz başarıyla kaydedildi.",
    noOpenPolls: "Şu anda açık anket yok.",
  },
  vi: {
    vote: "Bình chọn",
    polls: "Cuộc bình chọn",
    votingStarted: "Đã bắt đầu bình chọn",
    votingIsOver: "Bình chọn đã kết thúc",
    votingStartsSoon: "Sắp bắt đầu bình chọn",
    voteRegistered: "Phiếu bình chọn của bạn đã được ghi nhận.",
    noOpenPolls: "Hiện không có cuộc bình chọn nào đang mở.",
  },
  "zh-CN": {
    vote: "投票",
    polls: "投票列表",
    votingStarted: "投票已开始",
    votingIsOver: "投票已结束",
    votingStartsSoon: "投票即将开始",
    voteRegistered: "您的投票已成功记录。",
    noOpenPolls: "目前没有进行中的投票。",
  },
  "zh-TW": {
    vote: "投票",
    polls: "投票列表",
    votingStarted: "投票已開始",
    votingIsOver: "投票已結束",
    votingStartsSoon: "投票即將開始",
    voteRegistered: "您的投票已成功記錄。",
    noOpenPolls: "目前沒有進行中的投票。",
  },
}

const baseLanguage = (locale: string): string =>
  locale.split(LOCALE_SEPARATOR)[0]?.toLowerCase() ?? ""

/**
 * Exact locale first, then any catalogue entry sharing the base language
 * (`pt-BR` -> `pt-PT` if `pt-BR` were missing), then English.
 */
export function getPollBotStrings(language: string): PollBotStrings {
  const exact = POLL_BOT_STRINGS[language]
  if (exact) {
    return exact
  }
  const base = baseLanguage(language)
  const sameLanguageKey = Object.keys(POLL_BOT_STRINGS).find(
    (key) => baseLanguage(key) === base,
  )
  return (
    (sameLanguageKey ? POLL_BOT_STRINGS[sameLanguageKey] : undefined) ??
    (POLL_BOT_STRINGS[FALLBACK_LOCALE] as PollBotStrings)
  )
}
