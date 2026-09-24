import { sameMerchant } from './duplicate.helper'

describe('sameMerchant', () => {
  it.each([
    ['a name the bank cut', 'MP*MERCADOLI...', 'MP*MERCADOLIBRE'],
    ['case, accents and symbols', 'Pedidos Ya Food', 'PEDIDOSYA FO...'],
    ['the same name', 'YANGO', 'Yango'],
  ])('should match %s', (_case, a, b) => {
    expect(sameMerchant(a, b)).toBe(true)
  })

  it.each([
    ['different merchants', 'YANGO', 'UBER'],
    ['a too short text', 'MP', 'MP*GRUPOQTCS'],
    ['a missing text', null, 'YANGO'],
  ])('should not match %s', (_case, a, b) => {
    expect(sameMerchant(a, b)).toBe(false)
  })
})
