import nodemailer from "nodemailer"

export async function sendMagicLinkMail(email: string, url: string) {
  await sendMail(email, "Magic link", `<b><a href="${url}">Login</b>`)
}

async function sendMail(email: string, subject: string, html: string) {
  const mailer = nodemailer.createTransport(
    process.env.EMAIL_SERVER ?? "smtp://username:password@localhost:1025",
  )

  await mailer.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    html,
  })
}
