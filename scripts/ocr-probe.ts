// P21: free local OCR test (no AI). Reads the screenshots of a folder with tesseract.js (Spanish) as the bot does and
// reports what the templates of modules/recognition understood (D63), or that the screenshot would go to the AI.
// Usage: make ocr-probe [DIR=/tmp/capturas]   (default test/golden/images; both are outside git)
// The full OCR text of each image goes to test/eval/ocr-report/ (git-ignored: it carries personal data).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import { createWorker, PSM } from 'tesseract.js'

import { recognizeText, RecognitionResult, RecognizedScreen } from '../src/modules/recognition/recognition.templates'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const ROOT = join(__dirname, '..')
const REPORT_DIR = join(ROOT, 'test', 'eval', 'ocr-report')
// The Spanish model is downloaded once (from the jsDelivr CDN) and kept here
const CACHE_DIR = join(ROOT, '.cache', 'tesseract')

function describe(result: RecognitionResult | null): string[] {
  if (!result) return ['  template:  none → the AI reads it (Yape, IO list or something that did not add up)']
  if (result.screen === RecognizedScreen.IO_CATEGORY_SUMMARY) {
    return [
      `  template:  ${result.screen} · month ${result.month} · total ${result.total}`,
      ...result.categories.map((category) => `    ${category.name}: ${category.amount} (${category.count})`),
    ]
  }
  return [
    `  template:  ${result.screen}`,
    ...result.expenses.map(
      (expense) =>
        `    ${expense.spentAt} · ${expense.merchant} · ${expense.currency} ${expense.amount}` +
        `${expense.installments ? ` (1/${expense.installments} of ${expense.total})` : ''}${expense.pending ? ' · en proceso' : ''}`,
    ),
  ]
}

async function main() {
  const dir = process.argv[2] || join(ROOT, 'test', 'golden', 'images')
  const files = readdirSync(dir)
    .filter((file) => IMAGE_EXTENSIONS.includes(extname(file).toLowerCase()))
    .sort()

  if (!files.length) {
    console.log(`No images in ${dir}. Put the screenshots there (or pass DIR=<folder>) and run again.`)
    return
  }

  mkdirSync(REPORT_DIR, { recursive: true })
  mkdirSync(CACHE_DIR, { recursive: true })
  const worker = await createWorker('spa', 1, { cachePath: CACHE_DIR })
  // Screenshots have scattered text in several sizes: the default (single block) skips the big amount ("S/ 18")
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })

  try {
    for (const file of files) {
      const startedAt = Date.now()
      const { data } = await worker.recognize(join(dir, file))
      writeFileSync(join(REPORT_DIR, `${basename(file, extname(file))}.txt`), data.text)
      console.log(
        [
          `\n▶ ${file} · ${Date.now() - startedAt} ms · confidence ${Math.round(data.confidence)} %`,
          ...describe(recognizeText(data.text)),
        ].join('\n'),
      )
    }
  } finally {
    await worker.terminate()
  }

  console.log(`\nFull text of each image: ${REPORT_DIR}`)
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
