import { auditTriggersMigration, buildAuditTriggers, normalizeTriggerSql } from './audit-triggers'

const tables = [
  { table: 'exp_fixed_costs', idColumn: 'id', columns: ['id', 'description', 'amount', 'createdAt', 'updatedAt'] },
  { table: 'cat_people', idColumn: 'id', columns: ['id', 'name', 'documentNumber', 'updatedAt'] },
  { table: 'ntf_settings', idColumn: 'kind', columns: ['kind', 'telegram'] },
]

describe('buildAuditTriggers', () => {
  const triggers = buildAuditTriggers(tables)
  const byName = (name: string) => triggers.find((trigger) => trigger.name === name)!.sql

  it('should give every table an insert, an update and a delete trigger', () => {
    expect(triggers.map((trigger) => trigger.name)).toEqual([
      'aud_ins_exp_fixed_costs',
      'aud_upd_exp_fixed_costs',
      'aud_del_exp_fixed_costs',
      'aud_ins_cat_people',
      'aud_upd_cat_people',
      'aud_del_cat_people',
      'aud_ins_ntf_settings',
      'aud_upd_ntf_settings',
      'aud_del_ntf_settings',
    ])
  })

  it('should snapshot the whole row on a create and on a delete, with the key of the table', () => {
    const insert = byName('aud_ins_exp_fixed_costs')
    const del = byName('aud_del_ntf_settings')

    expect(insert).toContain('AFTER INSERT ON "exp_fixed_costs"')
    expect(insert).toContain(`json_object('id', NEW."id", 'description', NEW."description", 'amount', NEW."amount"`)
    expect(del).toContain('AFTER DELETE ON "ntf_settings"')
    expect(del).toContain(`OLD."kind", 'delete'`)
  })

  it('should compare only the columns that can change: updatedAt is not a change', () => {
    const update = byName('aud_upd_exp_fixed_costs')

    expect(update).toContain(`SELECT 'id' AS "k", OLD."id" AS "o", NEW."id" AS "n"`)
    expect(update).toContain(`UNION ALL SELECT 'description', OLD."description", NEW."description"`)
    expect(update).not.toContain(`'updatedAt'`)
    expect(update).toContain('WHERE "o" IS NOT "n"')
  })

  it('should write the migration: drop every trigger, then create them', () => {
    const sql = auditTriggersMigration(triggers)

    expect(sql).toContain('DROP TRIGGER IF EXISTS "aud_upd_exp_fixed_costs";')
    expect(sql.match(/^CREATE TRIGGER/gm)).toHaveLength(9)
    expect(normalizeTriggerSql('CREATE TRIGGER x\n  BEGIN\nEND;')).toBe('CREATE TRIGGER x BEGIN END')
  })
})
