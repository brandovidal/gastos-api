import { BadRequestException, Injectable } from '@nestjs/common'
import { strFromU8, unzipSync } from 'fflate'

import { ImportRowKind, ImportRowStatus, ImportTab } from '@/commons/constants/import.constant'
import { ImportNotPreviewException } from '@/commons/exceptions/import/import-not-preview.exception'
import { Prisma } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

import { NotionFile, NotionImporter } from './notion/notion-importer'
import { ImportRowsQueryDto } from './dto/request/imports.dto'

export interface UploadedImportFile {
  originalname: string
  buffer: Buffer
}

// Where each tab of the preview reads from
const TAB_WHERE: Record<ImportTab, Prisma.ImportRowWhereInput> = {
  [ImportTab.CARDS]: { kind: ImportRowKind.EXPENSE, targetTable: 'creditCardExpense' },
  [ImportTab.FIXED_COSTS]: { kind: ImportRowKind.EXPENSE, targetTable: 'fixedCost' },
  [ImportTab.PLATFORMS]: { kind: ImportRowKind.EXPENSE, targetTable: 'subscription' },
  [ImportTab.DEBTS]: { kind: ImportRowKind.EXPENSE, targetTable: 'debt' },
  [ImportTab.BUDGET]: { kind: { in: [ImportRowKind.GROUP, ImportRowKind.BUDGET] } },
  [ImportTab.ISSUES]: { kind: ImportRowKind.ISSUE },
}

const parse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

// The CSV files inside the uploads: a Notion ZIP (which may hold another ZIP, "Part-1.zip") or loose CSV files
export function unpackNotionFiles(uploads: UploadedImportFile[]): NotionFile[] {
  const fromZip = (data: Uint8Array, depth: number): NotionFile[] =>
    Object.entries(unzipSync(data)).flatMap(([name, content]) => {
      if (/\.zip$/i.test(name) && depth < 2) return fromZip(content, depth + 1)
      return /\.csv$/i.test(name) ? [{ name, content: strFromU8(content) }] : []
    })
  return uploads.flatMap((upload) =>
    /\.zip$/i.test(upload.originalname)
      ? fromZip(new Uint8Array(upload.buffer), 0)
      : /\.csv$/i.test(upload.originalname)
        ? [{ name: upload.originalname, content: upload.buffer.toString('utf8') }]
        : [],
  )
}

// Reconocimiento / Importación (P14, D104): a Notion export becomes a preview that is applied or discarded from the web
@Injectable()
export class ImportsService {
  private readonly importer: NotionImporter

  constructor(private readonly prisma: PrismaService) {
    this.importer = new NotionImporter(prisma)
  }

  async previewNotion(uploads: UploadedImportFile[]) {
    const files = unpackNotionFiles(uploads)
    if (!files.length) throw new BadRequestException('Sube el ZIP que exporta Notion o sus archivos CSV')
    const plan = await this.importer.plan(files, uploads.map((upload) => upload.originalname).join(', '))
    return this.get(await this.importer.preview(plan))
  }

  list() {
    return this.prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, omit: { summary: true } })
  }

  async get(id: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id } })
    if (!batch) throw new ImportNotPreviewException({ batchId: id, status: null })
    const groups = await this.prisma.importRow.groupBy({
      by: ['kind', 'targetTable', 'status'],
      where: { batchId: id },
      _count: { _all: true },
    })
    const count = (where: Prisma.ImportRowWhereInput) =>
      groups
        .filter((group) =>
          Object.entries(where).every(([key, value]) => {
            const field = group[key as 'kind' | 'targetTable']
            return typeof value === 'object' && value && 'in' in value
              ? (value.in as string[]).includes(field as string)
              : field === value
          }),
        )
        .reduce((sum, group) => sum + group._count._all, 0)
    const tabs = Object.fromEntries(Object.values(ImportTab).map((tab) => [tab, count(TAB_WHERE[tab])])) as Record<
      ImportTab,
      number
    >
    const status = (value: ImportRowStatus) =>
      groups.filter((group) => group.status === value).reduce((sum, group) => sum + group._count._all, 0)
    return {
      ...batch,
      summary: parse(batch.summary, { files: [], months: [] }),
      tabs,
      blocked: status(ImportRowStatus.BLOCKED),
      warnings: status(ImportRowStatus.WARNING),
    }
  }

  async rows(id: string, { tab, status, q, page, pageSize }: ImportRowsQueryDto) {
    const where: Prisma.ImportRowWhereInput = {
      batchId: id,
      ...TAB_WHERE[tab],
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ description: { contains: q } }, { message: { contains: q } }] } : {}),
    }
    const [total, rows] = await Promise.all([
      this.prisma.importRow.count({ where }),
      this.prisma.importRow.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { file: 'asc' }, { line: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: rows.map((row) => ({
        ...row,
        data: parse<Record<string, unknown>>(row.data, {}),
        raw: parse<Record<string, string>>(row.raw, {}),
      })),
      total,
      page,
      pageSize,
    }
  }

  apply(id: string) {
    return this.importer.apply(id)
  }

  discard(id: string) {
    return this.importer.discard(id)
  }
}
