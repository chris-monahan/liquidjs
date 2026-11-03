import { Liquid, LiquidFloat, formatFloat } from '../../../src'

describe('LiquidOptions#rubyNumbers', function () {
  const liquid = new Liquid({ rubyNumbers: true })
  const render = (tpl: string, scope: object = {}) => liquid.parseAndRenderSync(tpl, scope)

  describe('formatFloat (Ruby Float#to_s)', function () {
    it.each([
      [2, '2.0'], [2.5, '2.5'], [-0, '-0.0'], [0, '0.0'], [100, '100.0'],
      [0.0001, '0.0001'], [0.00001, '1.0e-05'], [0.00001234, '1.234e-05'],
      [999999999999999, '999999999999999.0'], [1e15, '1.0e+15'], [1234567890123456, '1.234567890123456e+15'],
      [3000000000000000.5, '3000000000000000.5'], [12345678901234568, '1.2345678901234568e+16'], [1.5e300, '1.5e+300'],
      [0.1 + 0.2, '0.30000000000000004'], [Infinity, 'Infinity'], [-Infinity, '-Infinity'], [NaN, 'NaN']
    ])('%s → %s', function (x, expected) {
      expect(formatFloat(x)).toBe(expected)
    })
  })

  describe('literals', function () {
    it('keeps decimal-point literals as floats', function () {
      expect(render('{{ 2.0 }}|{{ 2.50 }}|{{ -0.0 }}|{{ 007 }}|{{ -0 }}')).toBe('2.0|2.5|-0.0|7|0')
    })
    it('compares floats with integers numerically', function () {
      expect(render('{% assign x = 3.0 %}{% if x == 3 %}a{% endif %}{% if x > 2.9 %}b{% endif %}{% case x %}{% when 3 %}c{% endcase %}{% if 0.0 %}d{% endif %}')).toBe('abcd')
    })
    it('has no properties', function () {
      expect(render('[{{ f.size }}|{{ f.value }}|{{ f.first }}|{{ f | size }}]', { f: new LiquidFloat(3.14) })).toBe('[|||0]')
    })
    it('is off by default', function () {
      expect(new Liquid().parseAndRenderSync('{{ 2.0 }}|{{ 10 | divided_by: 4 }}')).toBe('2|2.5')
    })
  })

  describe('math filters', function () {
    it.each([
      ['{{ 10 | divided_by: 4 }}|{{ -7 | divided_by: 2 }}|{{ 7.0 | divided_by: 2 }}|{{ 10 | divided_by: 3.0 }}', '2|-4|3.5|3.3333333333333335'],
      ['{{ 0.3 | divided_by: 0.1 }}|{{ 1 | divided_by: 0.1 }}|{{ 1999 | divided_by: 100.0 }}', '3.0|10.0|19.99'],
      ['{{ -7 | modulo: 3 }}|{{ 7 | modulo: -3 }}|{{ -7.5 | modulo: 2 }}|{{ 5.3 | modulo: 1.1 }}', '2|-2|0.5|0.9'],
      ['{{ 0.1 | plus: 0.2 }}|{{ 1999 | times: 0.15 }}|{{ 1.1 | times: 1.1 }}|{{ 1.0 | plus: 1 }}|{{ 4.35 | times: 100 }}', '0.3|299.85|1.21|2.0|435.0'],
      ['{{ "3.7" | plus: 1 }}|{{ " 3 " | plus: 1 }}|{{ "1,234" | plus: 1 }}|{{ "1_000" | plus: 1 }}|{{ "abc" | plus: 1 }}|{{ ".5" | plus: 1 }}', '4.7|4|2|1001|1|1'],
      ['{{ nil | plus: 1 }}|{{ true | plus: 1 }}|{{ 5 | plus: nil }}', '1|1|5'],
      ['{{ 2.5 | round }}|{{ -2.5 | round }}|{{ 2.675 | round: 2 }}|{{ 1.005 | round: 2 }}|{{ 1234.5 | round: -2 }}|{{ 5 | round: 2 }}|{{ 5.0 | round: 2 }}|{{ 2.5 | round: "0" }}', '3|-3|2.68|1.01|1200|5|5.0|3'],
      ['{{ 3.2 | ceil }}|{{ -3.7 | floor }}|{{ "3.2" | ceil }}|{{ -3 | abs }}|{{ "-3.5" | abs }}|{{ "x" | abs }}', '4|-4|4|3|3.5|0'],
      ['{{ 5 | at_least: 2.5 }}|{{ 5.0 | at_most: 2 }}|{{ 4 | at_least: 4.0 }}|{{ 4.0 | at_least: 4 }}', '5|2|4|4.0'],
      ['{{ "abc" | times: -73.8 }}|{{ -2.5 | plus: 2.5 }}', '-0.0|0.0'],
      ['{{ 1.0 | divided_by: 0 }}|{{ 0.0 | divided_by: 0 }}|{{ -1 | divided_by: 0.0 }}', 'Infinity|NaN|-Infinity']
    ])('%s', function (tpl, expected) {
      expect(render(tpl)).toBe(expected)
    })

    it.each(['{{ 1 | divided_by: 0 }}', '{{ 1 | modulo: 0 }}', '{{ 7.5 | modulo: 0 }}', '{{ 5 | modulo: 0.0 }}'])('%s raises', function (tpl) {
      expect(() => render(tpl)).toThrow('divided by 0')
    })

    it('sums integers as integers and anything else as a float', function () {
      const scope = { a: [1, 2, 3], b: [1, new LiquidFloat(2)], c: ['1', '2.5', 'x'], d: [{ p: 1 }, { p: 2 }], e: [[1, 2], [3]] }
      expect(render('{{ a | sum }}|{{ b | sum }}|{{ c | sum }}|{{ d | sum: "p" }}|{{ e | sum }}', scope)).toBe('6|3.0|3.5|3|6')
    })
  })

  describe('LiquidFloat in data', function () {
    it('prints, compares and computes as a float', function () {
      const scope = { price: new LiquidFloat(3) }
      expect(render('{{ price }}|{{ price | times: 2 }}|{% if price == 3 %}eq{% endif %}', scope)).toBe('3.0|6.0|eq')
    })
    const itWithRawJSON = typeof (JSON as any).rawJSON === 'function' ? it : it.skip
    itWithRawJSON('serialises as a Ruby float in JSON', function () {
      expect(render('{{ x | json }}', { x: [new LiquidFloat(2), 1, new LiquidFloat(0.00001)] })).toBe('[2.0,1,1.0e-05]')
    })
    it('treats non-integer JS numbers as floats', function () {
      expect(render('{{ x | plus: 0 }}|{{ y | plus: 1 }}', { x: 2.5, y: 1e-7 })).toBe('2.5|1.0000001')
    })
  })
})
