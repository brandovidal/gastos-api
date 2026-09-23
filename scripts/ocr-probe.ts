// P21 step 1: free local OCR test (no AI). Reads the screenshots of a folder with tesseract.js (Spanish) and reports
// what a template parser would need: amounts, dates, operation numbers and the screen type (D47).
// Usage: make ocr-probe [DIR=/tmp/capturas]   (default test/golden/images; both are outside git)
// The full OCR text of each image goes to test/eval/ocr-report/ (git-ignored: it carries personal data).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import { createWorker, PSM } from 'tesseract.js'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const ROOT = join(__dirname, '..')
const REPORT_DIR = join(ROOT, 'test', 'eval', 'ocr-report')
// The Spanish model is downloaded once (from the jsDelivr CDN) and kept here
const CACHE_DIR = join(ROOT, '.cache', 'tesseract')

const AMOUNT = /(?:S\/|s\/|\$)\s?-?\s?\d[\d,]*(?:\.\d{2})?/g
const DATE = /\b\d{1,2}\s(?:ene|feb|mar|abr|may|jun|jul|ago|set|sep|sept|oct|nov|dic)[a-z]*\.?\s\d{4}\b/gi
const OPERATION = /n(?:ro|°|º)?\.?\s*de\s*operaci[oó]n\s*:?\s*(\d{5,})/i

// Screen types of D47, recognized by their fixed labels
const SCREENS: [string, RegExp][] = [
  ['yape_receipt', /yapeaste/i],
  ['bank_movement (Plin)', /detalle de movimiento/i],
  ['card_category_detail (IO)', /detalle de categor[ií]a/i],
  ['card_movements (IO)', /movimientos/i],
]

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
      const text = data.text
      const screen = SCREENS.find(([, label]) => label.test(text))?.[0] ?? 'unknown (would go to the AI)'

      writeFileSync(join(REPORT_DIR, `${basename(file, extname(file))}.txt`), text)
      console.log(
        [
          `\n▶ ${file} · ${Date.now() - startedAt} ms · confidence ${Math.round(data.confidence)} %`,
          `  screen:    ${screen}`,
          `  amounts:   ${(text.match(AMOUNT) ?? []).join(' · ') || '—'}`,
          `  dates:     ${(text.match(DATE) ?? []).join(' · ') || '—'}`,
          `  operation: ${text.match(OPERATION)?.[1] ?? '—'}`,
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
