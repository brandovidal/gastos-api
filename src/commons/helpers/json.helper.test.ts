import { JsonHelper } from './json.helper'

describe('JsonHelper', () => {
  describe('parseArray', () => {
    it('should parse a JSON array', () => {
      expect(JsonHelper.parseArray('["dany","mi esposa"]')).toEqual(['dany', 'mi esposa'])
    })

    it('should return an empty array for invalid, empty or non-array values', () => {
      expect(JsonHelper.parseArray('not json')).toEqual([])
      expect(JsonHelper.parseArray(null)).toEqual([])
      expect(JsonHelper.parseArray('{"a":1}')).toEqual([])
    })
  })

  describe('parseObject', () => {
    it('should parse a JSON object', () => {
      expect(JsonHelper.parseObject('{"amount":0.9}')).toEqual({ amount: 0.9 })
    })

    it('should return an empty object for invalid, empty or array values', () => {
      expect(JsonHelper.parseObject('{broken')).toEqual({})
      expect(JsonHelper.parseObject(undefined)).toEqual({})
      expect(JsonHelper.parseObject('[1,2]')).toEqual({})
    })
  })

  it('should stringify values', () => {
    expect(JsonHelper.stringify(['a'])).toBe('["a"]')
  })
})
