// Registers the webhook and the command menu of the Telegram bot (plan, section 3, steps 6 and 7).
// Usage: pnpm telegram:setup [https://public-url]   (defaults to PUBLIC_URL from .env.local)
//        --optional-webhook: without a public URL only the command menu is updated (used by pnpm deps)
import { BOT_COMMAND_DESCRIPTIONS } from '../src/commons/constants/conversation.constant'
import { TELEGRAM_ALLOWED_UPDATES, TELEGRAM_API_URL } from '../src/commons/constants/telegram.constant'

const WEBHOOK_PATH = '/v1/telegram/webhook'

async function call(token: string, method: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as { ok: boolean; result?: any; description?: string }

  if (!payload.ok) throw new Error(`${method} failed: ${payload.description}`)
  return payload.result
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const args = process.argv.slice(2)
  const optionalWebhook = args.includes('--optional-webhook')
  const publicUrl = (args.find((arg) => !arg.startsWith('--')) ?? process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
  const hasWebhook = Boolean(secret) && publicUrl.startsWith('https://')

  if (!token || (!hasWebhook && !optionalWebhook)) {
    throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and an https PUBLIC_URL (or pass it as argument)')
  }

  if (hasWebhook) {
    await call(token, 'setWebhook', {
      url: `${publicUrl}${WEBHOOK_PATH}`,
      secret_token: secret,
      allowed_updates: TELEGRAM_ALLOWED_UPDATES,
      drop_pending_updates: true,
    })
  } else {
    console.log('No https PUBLIC_URL: webhook left as it is (run pnpm telegram:setup <url> once the tunnel is up)')
  }

  await call(token, 'setMyCommands', {
    commands: Object.entries(BOT_COMMAND_DESCRIPTIONS).map(([command, description]) => ({ command, description })),
  })

  const info = await call(token, 'getWebhookInfo')
  console.log(`Webhook: ${info.url}`)
  console.log(`Pending updates: ${info.pending_update_count}`)
  if (info.last_error_message) console.log(`Last error: ${info.last_error_message}`)
  console.log(
    `Commands: ${Object.keys(BOT_COMMAND_DESCRIPTIONS)
      .map((command) => `/${command}`)
      .join(' ')}`,
  )
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
