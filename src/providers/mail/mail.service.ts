import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport, Transporter } from 'nodemailer'

import { MailConfig } from '@/settings/settings.model'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

// Email through Gmail's SMTP with an app password (P23): the way to invite people before there is a domain (D91).
// Off without SMTP_USER and SMTP_APP_PASSWORD; sending fails softly so an invitation is never lost for a mail error
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: Transporter | null = null

  constructor(private readonly configService: ConfigService) {}

  private get config(): MailConfig {
    return this.configService.get<MailConfig>('mail') ?? { fromName: 'Kogane' }
  }

  get isEnabled(): boolean {
    return !!this.config.user && !!this.config.appPassword
  }

  // true when Gmail took it; false (with a log) when it is off or failed
  async send(message: MailMessage): Promise<boolean> {
    if (!this.isEnabled) return false
    try {
      this.transporter ??= createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: this.config.user, pass: this.config.appPassword },
      })
      await this.transporter.sendMail({ from: `"${this.config.fromName}" <${this.config.user}>`, ...message })
      return true
    } catch (error) {
      this.logger.warn(`[send] email to ${message.to} not sent: ${(error as Error).message}`)
      return false
    }
  }
}
