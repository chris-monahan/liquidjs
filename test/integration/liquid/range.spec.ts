import { Liquid, Drop, LiquidRange } from '../../../src'

describe('range values', function () {
  const liquid = new Liquid()

  describe('rendering and memory', function () {
    it('should render ascending and descending ranges as start..stop', async function () {
      expect(await liquid.parseAndRender('{{ (1..5) }}')).toBe('1..5')
      expect(await liquid.parseAndRender('{{ (5..1) }}')).toBe('5..1')
      expect(await liquid.parseAndRender('{{ (-2..2) }}')).toBe('-2..2')
    })

    it('should normalize -0 bounds to 0', function () {
      const r = new LiquidRange(-0, -0)
      expect(Object.is(r.start, 0)).toBe(true)
      expect(Object.is(r.stop, 0)).toBe(true)
      expect(liquid.parseAndRenderSync('{{ (z..z) }}', { z: -0 })).toBe('0..0')
    })

    it('should render large ranges in O(1) memory even with tight memoryLimit', function () {
      const limited = new Liquid({ memoryLimit: 10 })
      expect(limited.parseAndRenderSync('{{ (1..1000000000) }}')).toBe('1..1000000000')
    })

    it('should enforce memoryLimit when materializing large ranges in filters and tags', function () {
      const limited = new Liquid({ memoryLimit: 10 })
      expect(() => limited.parseAndRenderSync('{{ (1..100) | join: "," }}')).toThrow('memory alloc limit exceeded')
      expect(() => limited.parseAndRenderSync('{{ (1..100) | reverse }}')).toThrow('memory alloc limit exceeded')
      expect(() => limited.parseAndRenderSync('{% tablerow i in (1..100) %}{{ i }}{% endtablerow %}')).toThrow('memory alloc limit exceeded')
    })

    it('should iterate over LiquidRange via Symbol.iterator', function () {
      expect([...new LiquidRange(1, 4)]).toEqual([1, 2, 3, 4])
      expect([...new LiquidRange(4, 1)]).toEqual([])
    })
  })

  describe('properties and filters', function () {
    it('should support first, last, and size on ascending ranges', function () {
      expect(liquid.parseAndRenderSync('{{ (1..5).first }}/{{ (1..5) | first }}')).toBe('1/1')
      expect(liquid.parseAndRenderSync('{{ (1..5).last }}/{{ (1..5) | last }}')).toBe('5/5')
      expect(liquid.parseAndRenderSync('{{ (1..5).size }}/{{ (1..5) | size }}')).toBe('5/5')
    })

    it('should support first, last, and size on descending ranges', function () {
      expect(liquid.parseAndRenderSync('{{ (5..1).first }}/{{ (5..1) | first }}')).toBe('5/5')
      expect(liquid.parseAndRenderSync('{{ (5..1).last }}/{{ (5..1) | last }}')).toBe('1/1')
      expect(liquid.parseAndRenderSync('{{ (5..1).size }}/{{ (5..1) | size }}')).toBe('0/0')
    })

    it('should return undefined for numeric index and internal properties', function () {
      expect(liquid.evalValueSync('(1..5)[0]')).toBeUndefined()
      expect(liquid.evalValueSync('(1..5).start')).toBeUndefined()
      expect(liquid.evalValueSync('(1..5).stop')).toBeUndefined()
      expect(liquid.evalValueSync('(1..5).length')).toBeUndefined()
    })

    it('should materialize ranges in array filters', function () {
      expect(liquid.parseAndRenderSync('{{ (1..4) | join: "-" }}')).toBe('1-2-3-4')
      expect(liquid.parseAndRenderSync('{{ (1..4) | reverse | join: "," }}')).toBe('4,3,2,1')
      expect(liquid.parseAndRenderSync('{{ (1..5) | sum }}')).toBe('15')
      expect(liquid.parseAndRenderSync('{{ (1..2) | concat: (3..4) | join: "," }}')).toBe('1,2,3,4')
    })
  })

  describe('operators and comparisons', function () {
    it('should support O(1) numeric range inclusion with contains', function () {
      expect(liquid.evalValueSync('(1..5) contains 3')).toBe(true)
      expect(liquid.evalValueSync('(1..5) contains 3.5')).toBe(true)
      expect(liquid.evalValueSync('(1..5) contains "3"')).toBe(false)
      expect(liquid.evalValueSync('(1..5) contains 0')).toBe(false)
      expect(liquid.evalValueSync('(5..1) contains 3')).toBe(false)
      expect(liquid.evalValueSync('(1..1000000000) contains 500000000')).toBe(true)
    })

    it('should unwrap Drop values in contains', async function () {
      class NumDrop extends Drop {
        valueOf () { return 3 }
      }
      expect(await liquid.evalValue('(1..5) contains d', { d: new NumDrop() })).toBe(true)
    })

    it('should compare ranges by value and not equal arrays or empty/blank/nil', function () {
      expect(liquid.evalValueSync('(1..5) == (1..5)')).toBe(true)
      expect(liquid.evalValueSync('(1..5) == (1..4)')).toBe(false)
      expect(liquid.evalValueSync('(1..5) != (1..4)')).toBe(true)
      expect(liquid.evalValueSync('(1..5) == arr', { arr: [1, 2, 3, 4, 5] })).toBe(false)
      expect(liquid.evalValueSync('arr == (1..5)', { arr: [1, 2, 3, 4, 5] })).toBe(false)
      expect(liquid.evalValueSync('(1..5) == empty')).toBe(false)
      expect(liquid.evalValueSync('empty == (1..5)')).toBe(false)
      expect(liquid.evalValueSync('(5..1) == empty')).toBe(false)
      expect(liquid.evalValueSync('empty == (5..1)')).toBe(false)
      expect(liquid.evalValueSync('(1..5) == blank')).toBe(false)
      expect(liquid.evalValueSync('blank == (1..5)')).toBe(false)
      expect(liquid.evalValueSync('(5..1) == blank')).toBe(false)
      expect(liquid.evalValueSync('blank == (5..1)')).toBe(false)
      expect(liquid.evalValueSync('(1..5) == nil')).toBe(false)
      expect(liquid.evalValueSync('(1..5) < (2..6)')).toBe(false)
      expect(liquid.evalValueSync('(1..5) <= (1..5)')).toBe(false)
      expect(liquid.evalValueSync('(1..5) > (0..1)')).toBe(false)
      expect(liquid.evalValueSync('(1..5) >= (1..5)')).toBe(false)
    })
  })

  describe('bound coercion', function () {
    it('should truncate static float literal bounds', function () {
      expect(liquid.parseAndRenderSync('{{ (1.5..3.9) }}')).toBe('1..3')
      expect(liquid.parseAndRenderSync('{{ (-1.9..2.7) }}')).toBe('-1..2')
      expect(liquid.parseAndRenderSync('{{ (-0.5..0.5) }}')).toBe('0..0')
    })

    it('should throw invalid integer on dynamic float bounds', function () {
      expect(() => liquid.parseAndRenderSync('{% assign f = 1.5 %}{{ (f..3) }}')).toThrow('invalid integer')
      expect(() => liquid.parseAndRenderSync('{% assign f = 3.5 %}{{ (1..f) }}')).toThrow('invalid integer')
    })

    it('should coerce string bounds like Ruby String#to_i', function () {
      expect(liquid.parseAndRenderSync('{% assign s = "4b" %}{{ (1..s) }}')).toBe('1..4')
      expect(liquid.parseAndRenderSync('{{ (" -2x".." +3y") }}')).toBe('-2..3')
      expect(liquid.parseAndRenderSync('{{ ("abc".."0x10") }}')).toBe('0..0')
    })

    it('should coerce nil and undefined bounds to 0', function () {
      expect(liquid.parseAndRenderSync('{{ (nil..3) }}')).toBe('0..3')
      expect(liquid.parseAndRenderSync('{{ (missing..2) }}')).toBe('0..2')
    })

    it('should throw invalid integer on boolean, array, and object bounds', function () {
      expect(() => liquid.parseAndRenderSync('{{ (true..3) }}')).toThrow('invalid integer')
      expect(() => liquid.parseAndRenderSync('{{ (false..3) }}')).toThrow('invalid integer')
      expect(() => liquid.parseAndRenderSync('{{ (arr..3) }}', { arr: [1] })).toThrow('invalid integer')
      expect(() => liquid.parseAndRenderSync('{{ (obj..3) }}', { obj: {} })).toThrow('invalid integer')
    })

    it('should not stringify range expressions used as bracket keys', function () {
      expect(liquid.parseAndRenderSync('{{ numbers[(1..3)] }}', { numbers: { '1..3': 'range' } })).toBe('')
    })
  })
})
