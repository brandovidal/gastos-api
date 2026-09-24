import { StatementPasswordException } from '@/commons/exceptions/statement/statement-password.exception'
import { StatementUnreadableException } from '@/commons/exceptions/statement/statement-unreadable.exception'

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

// pdfjs-dist is ESM only: a native import() in the CommonJS build (TypeScript would turn a plain one into require());
// test runners without a dynamic import callback use the plain one, which they resolve themselves
const nativeImport = new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")') as () => Promise<PdfJs>
async function loadPdfJs(): Promise<PdfJs> {
  try {
    return await nativeImport()
  } catch {
    return import('pdfjs-dist/legacy/build/pdf.mjs')
  }
}

// pdf.js PasswordException codes
const NEED_PASSWORD = 1

interface TextItem {
  str: string
  transform: number[]
}

// The text of a statement PDF, one string per printed line (items of the same height joined left to right).
// The password is the document number of the owner (D94); it never leaves the server.
export async function readPdfLines(data: Buffer, password?: string | null): Promise<string[]> {
  const pdfjs = await loadPdfJs()
  let pdf: Awaited<ReturnType<PdfJs['getDocument']>['promise']>
  try {
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(data),
      password: password ?? undefined,
      verbosity: 0,
    }).promise
  } catch (error) {
    const { name, code } = error as { name?: string; code?: number }
    if (name === 'PasswordException') {
      throw new StatementPasswordException({ reason: code === NEED_PASSWORD && !password ? 'missing' : 'incorrect' })
    }
    throw new StatementUnreadableException({ reason: 'not a PDF' })
  }

  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const { items } = await page.getTextContent()
    const byLine = new Map<number, { x: number; text: string }[]>()
    for (const item of items as TextItem[]) {
      if (!item.str?.trim()) continue
      // Items of one printed line differ by a point or two in height
      const y = Math.round(item.transform[5] / 2) * 2
      byLine.set(y, [...(byLine.get(y) ?? []), { x: item.transform[4], text: item.str.trim() }])
    }
    ;[...byLine.entries()]
      .sort(([a], [b]) => b - a)
      .forEach(([, parts]) =>
        lines.push(
          parts
            .sort((a, b) => a.x - b.x)
            .map((part) => part.text)
            .join(' '),
        ),
      )
  }
  await pdf.destroy()
  return lines
}
