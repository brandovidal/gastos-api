import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { AiProvider } from '@/commons/constants/ai.constant'
import { AiInputPartType } from '@/commons/constants/ai.constant'
import { BotCommand, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel, ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { PrismaModule } from '@/db/prisma/prisma.module'
import { PrismaService } from '@/db/prisma/prisma.service'
import { seedCatalogs } from '@/db/seed/catalog.seed'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { GroqTranscriberService } from '@/providers/ai/groq/groq-transcriber.service'
import { AiExtractorProviderStrategy } from '@/providers/ai/ai-extractor-provider.strategy'
import { AiExtractorProvider, GenerateJsonRequest } from '@/providers/ai/dto/ai-extractor.dto'
import { SettingsModule } from '@/settings/settings.module'

import { decodeBotAction } from './bot-action.codec'
import { ConversationModule } from './conversation.module'
import { ConversationService } from './conversation.service'
import { MediaDownloaderRegistry } from './media-downloader.registry'
import { BotReply } from './dto/conversation.types'

// Real AI answers recorded by `make eval-ai CONFIRM=yes RECORD=1` (P9): the flows run the real prompt output through the
// resolver, the state machine and SQLite without calling the AI
const fixtures = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/ai-responses.json'), 'utf8')) as {
  recordedAt: string
  responses: Record<string, string>
}

// Synthetic answer for a Yape screenshot (no real receipt is committed: they carry personal data)
let yapeRef = ''
const yapeScreenshotAnswer = () =>
  JSON.stringify({
    expenses: [
      {
        destination: 'daily',
        description: 'Yape a Bodega Don Lucho',
        amount: 18,
        currency: 'PEN',
        spentAt: '2026-09-23',
        expenseType: 'essential',
        installment: null,
        period: null,
        personRef: null,
        paymentMethodRef: yapeRef,
        categoryRef: null,
        merchant: 'Bodega Don Lucho',
        operationNumber: '04567812',
        notes: null,
        confidence: {
          destination: 0.9,
          description: 0.8,
          amount: 0.99,
          spentAt: 0.95,
          merchant: 0.95,
          operationNumber: 0.99,
        },
      },
    ],
  })

class RecordedAiProvider implements AiExtractorProvider {
  readonly supportsImages = true

  constructor(readonly provider: AiProvider) {}

  async generateJson({ parts }: GenerateJsonRequest) {
    if (parts.some((part) => part.type === AiInputPartType.IMAGE)) return { text: yapeScreenshotAnswer() }

    const message = parts.find((part) => part.type === AiInputPartType.TEXT)
    const text = message && 'text' in message ? fixtures.responses[message.text] : undefined
    if (!text) throw new Error('AI unavailable (no recorded answer)')
    return { text }
  }
}

describe('Conversation flows (integration)', () => {
  let moduleRef: TestingModule
  let conversation: ConversationService
  let prisma: PrismaService
  let chatCount = 0
  let messageCount = 0
  let chatId: string

  // The clock is frozen on the recording day: move it one second per message so drafts keep their order
  const tick = () => vi.setSystemTime(new Date(Date.now() + 1_000))
  const text = async (body: string, messageId = String(++messageCount)) => {
    tick()
    return (
      await conversation.handle({
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId,
        messageId,
        type: ChannelMessageType.TEXT,
        text: body,
      })
    ).replies
  }
  const command = async (name: BotCommand) => {
    tick()
    return (
      await conversation.handle({
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId,
        messageId: String(++messageCount),
        type: ChannelMessageType.COMMAND,
        command: name,
      })
    ).replies
  }
  const press = async (reply: BotReply, label: string) => {
    const button = reply.buttons?.flat().find((candidate) => candidate.label.includes(label))
    if (!button) throw new Error(`No "${label}" button in: ${reply.text}`)
    tick()
    const { replies } = await conversation.handle({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId,
      messageId: `cb-${++messageCount}`,
      type: ChannelMessageType.ACTION,
      action: decodeBotAction(button.data)!,
    })
    return replies
  }
  const lastDraft = () =>
    prisma.expenseDraft.findFirstOrThrow({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      include: {
        dailyExpense: true,
        fixedCost: true,
        subscription: true,
        creditCardExpense: true,
        accountReceivable: true,
      },
    })
  const paymentMethodId = async (name: string) => (await prisma.paymentMethod.findUniqueOrThrow({ where: { name } })).id

  beforeAll(async () => {
    // Same day as the recording: relative dates ("ayer") and card billing months stay valid
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${fixtures.recordedAt}T17:00:00.000Z`))

    moduleRef = await Test.createTestingModule({ imports: [SettingsModule, PrismaModule, ConversationModule] })
      .overrideProvider(AiExtractorProviderStrategy)
      .useValue({ getProvider: (type: AiProvider) => new RecordedAiProvider(type) })
      // Whisper stand-in: every voice note says a sentence of the golden set
      .overrideProvider(GroqTranscriberService)
      .useValue({ transcribe: async () => 'cafe 8 con plin' })
      .compile()
    await moduleRef.init()

    conversation = moduleRef.get(ConversationService)
    prisma = moduleRef.get(PrismaService)
    moduleRef.get(MediaDownloaderRegistry).register(ExpenseDraftChannel.TELEGRAM, async () => ({
      mimeType: 'image/jpeg',
      data: Buffer.from('fake-jpeg').toString('base64'),
    }))
    await seedCatalogs(prisma)
    yapeRef = (await moduleRef.get(ExpenseExtractionService).loadCatalog()).entries.find(
      (entry) => entry.name === 'Yape',
    )!.ref
  })

  afterAll(async () => {
    await moduleRef.close()
    vi.useRealTimers()
  })

  beforeEach(() => {
    chatId = `flow-chat-${++chatCount}`
  })

  it('should save a day-to-day expense paid with Yape in exp_daily_expenses', async () => {
    const [summary] = await text('almuerzo 25 soles con yape')
    await press(summary, 'Guardar')

    const draft = await lastDraft()
    expect(draft.status).toBe(ExpenseDraftStatus.SAVED)
    expect(draft.dailyExpense).toMatchObject({
      amount: 25,
      paymentMethodId: await paymentMethodId('Yape'),
    })
  })

  it('should ask for the payment method, take the quick reply and keep "ayer" as the date', async () => {
    const [question] = await text('uber 18.50 ayer')
    expect(question.text).toContain('¿Con qué pagaste?')

    const [summary] = await press(question, 'Efectivo')
    await press(summary, 'Guardar')

    const { dailyExpense } = await lastDraft()
    expect(dailyExpense?.paymentMethodId).toBe(await paymentMethodId('Efectivo'))
    expect(dailyExpense?.spentAt.toISOString().slice(0, 10)).toBe('2026-09-22')
  })

  it('should save a card purchase in installments in the billing month of the card', async () => {
    const [summary] = await text('zapatillas 300 con io en 3 cuotas')
    await press(summary, 'Guardar')

    // IO closes on the 25th: a purchase on the 23rd is billed in September
    expect((await lastDraft()).creditCardExpense).toMatchObject({
      installment: '1/3',
      paymentMonth: 9,
      paymentYear: 2026,
    })
  })

  it('should route a fixed cost, a subscription and a receivable to their tables', async () => {
    let [summary] = await text('luz 120 soles con bcp')
    await press(summary, 'Guardar')
    expect((await lastDraft()).fixedCost).not.toBeNull()
    ;[summary] = await text('netflix 45 mensual con la oh')
    await press(summary, 'Guardar')
    expect((await lastDraft()).subscription?.period).toBe('monthly')
    ;[summary] = await text('le presté 100 a dany')
    await press(summary, 'Guardar')
    const danery = await prisma.person.findUniqueOrThrow({ where: { name: 'Danery' } })
    expect((await lastDraft()).accountReceivable?.personId).toBe(danery.id)
  })

  it('should apply a local correction without calling the AI', async () => {
    await text('cafe 8 con plin')
    const [summary] = await text('monto 10')

    expect(summary.text).toContain('10')
    await press(summary, 'Guardar')
    expect((await lastDraft()).dailyExpense?.amount).toBe(10)
  })

  it('should offer to add an unknown payment method and use it', async () => {
    await text('pasaje 5 soles')
    const [offer] = await text('bbva')
    expect(offer.text).toContain('No conozco')

    const created = await press(offer, 'Billetera')
    await press(created[created.length - 1], 'Guardar')

    expect((await lastDraft()).dailyExpense?.paymentMethodId).toBe(await paymentMethodId('bbva'))
  })

  it('should send an expense to /borrador and save it after Retomar', async () => {
    const [summary] = await text('cafe 8 con plin')
    await press(summary, 'Borrador')

    const drafts = await command(BotCommand.DRAFTS)
    const [resumed] = await press(drafts[1], 'Retomar')
    await press(resumed, 'Guardar')

    expect((await lastDraft()).dailyExpense).not.toBeNull()
  })

  it('should ignore a webhook retry of a message already handled', async () => {
    await text('almuerzo 25 soles con yape', 'same-message')

    await expect(text('almuerzo 25 soles con yape', 'same-message')).resolves.toEqual([])
    expect(await prisma.expenseDraft.count({ where: { chatId } })).toBe(1)
  })

  it('should discard a message that is not an expense', async () => {
    const [reply] = await text('hola, cómo estás?')

    expect(reply.text).toContain('No encontré un gasto')
    expect((await lastDraft()).status).toBe(ExpenseDraftStatus.DISCARDED)
  })

  it('should leave the message in /borrador as failed when the AI is down', async () => {
    const [reply] = await text('mensaje que la AI no puede leer 99')

    expect(reply.text).toContain('/borrador')
    expect((await lastDraft()).status).toBe(ExpenseDraftStatus.FAILED)
    const drafts = await command(BotCommand.DRAFTS)
    expect(drafts.some((item) => item.buttons?.flat().some((button) => button.label.includes('Retomar')))).toBe(true)
  })

  it('should answer /resumen, /ultimos and /uso', async () => {
    const [summary] = await text('almuerzo 25 soles con yape')
    await press(summary, 'Guardar')

    expect((await command(BotCommand.SUMMARY))[0].text).toContain('Día a día')
    expect((await command(BotCommand.RECENT))[0].text).toMatch(/almuerzo/i)
    expect((await command(BotCommand.USAGE))[0].text).toContain('Uso de la AI hoy')
  })

  it('should read a Yape screenshot, save it, and then spot the same image and the same operation', async () => {
    const image = (messageId: string, uniqueId: string) =>
      conversation.handle({
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId,
        messageId,
        type: ChannelMessageType.IMAGE,
        media: { fileId: `file-${uniqueId}`, uniqueId },
        text: 'yape',
      })

    tick()
    const [summary] = (await image('img-1', 'unique-yape-1')).replies
    await press(summary, 'Guardar')
    const saved = await lastDraft()
    expect(saved).toMatchObject({ inputType: 'image', mediaUniqueId: 'unique-yape-1', operationNumber: '04567812' })
    expect(saved.dailyExpense?.paymentMethodId).toBe(await paymentMethodId('Yape'))

    tick()
    expect((await image('img-2', 'unique-yape-1')).replies[0].text).toContain('Ya recibí esta imagen')

    // Another screenshot of the same payment (different file, same operation number)
    tick()
    expect((await image('img-3', 'unique-yape-2')).replies[0].text).toContain('Parece que ya registraste este gasto')
  })

  it('should transcribe a voice note, show what it heard and save the expense', async () => {
    tick()
    const { replies } = await conversation.handle({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId,
      messageId: 'voice-1',
      type: ChannelMessageType.AUDIO,
      media: { fileId: 'file-voice-1', uniqueId: 'unique-voice-1', durationSeconds: 5 },
    })
    expect(replies[0].text).toContain('Entendí')

    await press(replies[0], 'Guardar')
    const saved = await lastDraft()
    expect(saved).toMatchObject({ inputType: 'audio', rawText: 'cafe 8 con plin', status: ExpenseDraftStatus.SAVED })
    expect(saved.dailyExpense?.paymentMethodId).toBe(await paymentMethodId('Plin'))
    expect(await prisma.aiRequestLog.count({ where: { draftId: saved.id } })).toBeGreaterThan(0)
  })
})
