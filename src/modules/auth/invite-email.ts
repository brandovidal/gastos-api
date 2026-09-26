import { UserRole } from '@/commons/constants/auth.constant'

import { MailMessage } from '@/providers/mail/mail.service'

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

// The email of an invitation (Spanish, like the web): who invites, the link and until when it works
export function inviteEmail(input: {
  to: string
  url: string
  invitedBy: string
  role: UserRole
  days: number
}): MailMessage {
  const role = input.role === UserRole.ADMIN ? 'administrador' : 'miembro'
  const inviter = escapeHtml(input.invitedBy)
  const text = [
    `${input.invitedBy} te invitó a Kogane (control de gastos) como ${role}.`,
    '',
    `Abre este enlace para entrar: ${input.url}`,
    '',
    `Sirve una sola vez y vence en ${input.days} días. Entra con Google usando este correo, o elige una contraseña.`,
    'Si no esperabas esta invitación, ignora este correo.',
  ].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
<h2 style="margin:0 0 12px">Te invitaron a Kogane</h2>
<p>${inviter} te invitó a Kogane (control de gastos) como <b>${role}</b>.</p>
<p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Entrar a Kogane</a></p>
<p style="color:#555;font-size:13px">Sirve una sola vez y vence en ${input.days} días. Entra con Google usando este correo, o elige una contraseña.<br>Si no esperabas esta invitación, ignora este correo.</p>
</div>`
  return { to: input.to, subject: 'Te invitaron a Kogane', text, html }
}
