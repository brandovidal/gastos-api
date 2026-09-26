import { randomUUID } from 'node:crypto'

import { AuditAction, AuditSource } from '@/commons/constants/audit.constant'
import { PrismaService } from '@/db/prisma/prisma.service'

// The history triggers read the row aud_context (id 1) to know who is writing (P29, D122). Every entry point sets it
// before its writes; two entries at the same time can mix the source of a few rows (one user: accepted, D122)
export async function setAuditContext(
  prisma: Pick<PrismaService, 'auditContext'>,
  source: AuditSource,
  options: { batchId?: string | null; actorId?: string | null } = {},
): Promise<void> {
  await prisma.auditContext.upsert({
    where: { id: 1 },
    create: { id: 1, source, batchId: options.batchId ?? null, actorId: options.actorId ?? null },
    update: { source, batchId: options.batchId ?? null, actorId: options.actorId ?? null },
  })
}

export interface AuditEvent {
  entity: string
  entityId: string
  action: AuditAction
  changes: Record<string, unknown>
  source: AuditSource
  batchId?: string | null
}

// What the triggers do not write: the one event of an import (or of any batch of changes done as one)
export async function recordAuditEvent(prisma: Pick<PrismaService, 'auditChange'>, event: AuditEvent): Promise<void> {
  await prisma.auditChange.create({
    data: {
      id: randomUUID().replace(/-/g, '').slice(0, 24),
      entity: event.entity,
      entityId: event.entityId,
      action: event.action,
      changes: JSON.stringify(event.changes),
      source: event.source,
      batchId: event.batchId ?? null,
      createdAt: new Date(),
    },
  })
}

// An import writes thousands of rows: the triggers skip them (source = import) and it leaves a single event with
// its own summary (the detail is in imp_rows)
export async function runAsImport<T extends object>(
  prisma: Pick<PrismaService, 'auditContext' | 'auditChange'>,
  event: { entity: string; entityId: string; action: AuditAction },
  work: () => Promise<T>,
): Promise<T> {
  await setAuditContext(prisma, AuditSource.IMPORT, { batchId: event.entityId })
  try {
    const summary = await work()
    await recordAuditEvent(prisma, {
      ...event,
      changes: summary as Record<string, unknown>,
      source: AuditSource.IMPORT,
      batchId: event.entityId,
    })
    return summary
  } finally {
    await setAuditContext(prisma, AuditSource.CLI)
  }
}
