import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

const sendMail = vi.fn()
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }))

import { createTransport } from 'nodemailer'

import { MailService } from './mail.service'

const message = { to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' }
const service = (mail: Record<string, unknown>) => new MailService(new ConfigService({ mail }))

describe('MailService', () => {
  afterEach(() => vi.clearAllMocks())

  it('should be off without a Gmail account and its app password, and send nothing', async () => {
    const off = service({ fromName: 'Kogane' })

    expect(off.isEnabled).toBe(false)
    expect(await off.send(message)).toBe(false)
    expect(createTransport).not.toHaveBeenCalled()
  })

  it('should send through Gmail as the account, with the name of the app', async () => {
    sendMail.mockResolvedValue({})

    expect(await service({ user: 'yo@gmail.com', appPassword: 'abcd efgh', fromName: 'Kogane' }).send(message)).toBe(
      true,
    )

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        secure: true,
        auth: { user: 'yo@gmail.com', pass: 'abcd efgh' },
      }),
    )
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"Kogane" <yo@gmail.com>', to: 'a@example.com' }),
    )
  })

  it('should fail softly: a Gmail error is false, not an exception', async () => {
    sendMail.mockRejectedValue(new Error('Invalid login'))

    expect(await service({ user: 'yo@gmail.com', appPassword: 'mala', fromName: 'Kogane' }).send(message)).toBe(false)
  })
})
