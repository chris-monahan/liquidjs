import { Liquid, Drop } from '../../../src'

describe('tags/if', function () {
  const liquid = new Liquid()
  const scope = {
    one: 1,
    two: 2,
    emptyString: '',
    emptyArray: []
  }

  class BooleanDrop extends Drop {
    public valueOf () {
      return false
    }
  }

  it('should throw if not closed', function () {
    const src = '{% if false%}yes'
    return expect(liquid.parseAndRender(src, scope))
      .rejects.toThrow(/tag {% if false%} not closed/)
  })
  it('should support nested', async function () {
    const src = '{%if false%}{%if true%}{%else%}a{%endif%}{%endif%}'
    const html = await liquid.parseAndRender(src, scope)
    return expect(html).toBe('')
  })

  it('should throw for additional args', function () {
    const src = "{% if foo %} foo {% else foo = 'blah' %} {% endif %}"
    return expect(liquid.parseAndRender(src, scope))
      .rejects.toThrow(`unexpected "foo = 'blah'", line:1, col:1`)
  })

  describe('single value as condition', function () {
    it('should support boolean', async function () {
      const src = '{% if false %}1{%elsif true%}2{%else%}3{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('2')
    })
    it('should treat Array truthy', async function () {
      const src = '{%if emptyArray%}a{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('a')
    })
    it('should return true if empty string', async function () {
      const src = '{%if emptyString%}a{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('a')
    })
  })
  describe('expression as condition', function () {
    it('should support ==', async function () {
      const src = '{% if 2 == 3 %}yes{%else%}no{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })
    it('should support >=', async function () {
      const src = '{% if 1 >= 2 and one<two %}a{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('')
    })
    it('should support !=', async function () {
      const src = '{% if one != two %}yes{%else%}no{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('yes')
    })
    it('should keep comparable operands uncoerced', async function () {
      const src = '{% if empty == empty %}yes{%else%}no{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })
    it('should keep comparable operands uncoerced in elsif', async function () {
      const src = '{% if false %}a{% elsif empty == empty %}b{% else %}c{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('c')
    })
    it('should support value and expression', async function () {
      const src = `X{%if version and version != '' %}x{{version}}y{%endif%}Y`
      const scope = { 'version': '' }
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('XY')
    })
    it('should evaluate right to left', async function () {
      const src = `{% if false and false or true %}true{%endif%}`
      const html = await liquid.parseAndRender(src)
      return expect(html).toBe('')
    })
    it('should allow no spaces around operator for literal', async function () {
      const src = `{% if true==true %}success{%else%}fail{% endif %}`
      const html = await liquid.parseAndRender(src)
      return expect(html).toBe('success')
    })
    it('should allow no spaces around operator for variables', async function () {
      const src = `{%assign var = 1%}{%if var ==1%}success{%else%}fail{%endif%}`
      const html = await liquid.parseAndRender(src)
      return expect(html).toBe('success')
    })
  })
  describe('filters as condition', function () {
    it('should support filter on expression', async function () {
      liquid.registerFilter('negate', (val) => !val)
      const src = '{% if 2 == 3 | negate %}yes{%else%}no{%endif%}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('yes')
    })
  })
  describe('compare to null', function () {
    it('should evaluate false for null < 10', async function () {
      const src = '{% if null < 10 %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for null > 10', async function () {
      const src = '{% if null > 10 %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for null <= 10', async function () {
      const src = '{% if null <= 10 %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for null >= 10', async function () {
      const src = '{% if null >= 10 %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for 10 < null', async function () {
      const src = '{% if 10 < null %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for 10 > null', async function () {
      const src = '{% if 10 > null %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for 10 <= null', async function () {
      const src = '{% if 10 <= null %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })

    it('should evaluate false for 10 >= null', async function () {
      const src = '{% if 10 >= null %}yes{% else %}no{% endif %}'
      const html = await liquid.parseAndRender(src, scope)
      return expect(html).toBe('no')
    })
  })
  it('should support sync', function () {
    const src = '{%if true%}true{%else%}false{%endif%}'
    const html = liquid.parseAndRenderSync(src, scope)
    return expect(html).toBe('true')
  })
  it('should support async variables', async () => {
    const src = `{%if var == 'var' %}success{%endif%}`
    const scope = { 'var': Promise.resolve('var') }
    const html = await liquid.parseAndRender(src, scope)
    return expect(html).toBe('success')
  })
  it('should support drop as condition variable', async () => {
    const src = `{% if drop %}yes{% else %}no{% endif %}`
    const scope = { drop: new BooleanDrop() }
    const html = await liquid.parseAndRender(src, scope)
    return expect(html).toBe('no')
  })
  it('should throw for duplicated else', () => {
    expect(() => liquid.parseAndRenderSync('{% if false %}{% else %}{% else %}{% endif %}'))
      .toThrow(`duplicated else`)
  })
  it('should throw for unexpected elsif', () => {
    expect(() => liquid.parseAndRenderSync('{% if false %}{% else %}{% elsif true %}{% endif %}'))
      .toThrow(`unexpected elsif after else`)
  })
  describe('parenthesized filter chains', function () {
    describe('when enabled', function () {
      const ge = new Liquid({ groupedExpressions: true })
      it('should support (foo | upcase) == "BAR"', async function () {
        const src = '{% if (foo | upcase) == "BAR" %}yes{% else %}no{% endif %}'
        const html = await ge.parseAndRender(src, { foo: 'bar' })
        return expect(html).toBe('yes')
      })
      it('should support both sides parenthesized', async function () {
        const src = '{% if (a | upcase) == (b | upcase) %}yes{% else %}no{% endif %}'
        const html = await ge.parseAndRender(src, { a: 'hi', b: 'hi' })
        return expect(html).toBe('yes')
      })
      it('should support with logical operators', async function () {
        const src = '{% if (a | upcase) == "FOO" and (b | downcase) == "bar" %}yes{% else %}no{% endif %}'
        const html = await ge.parseAndRender(src, { a: 'foo', b: 'BAR' })
        return expect(html).toBe('yes')
      })
      it('should support standalone parenthesized filter via evalValueSync', function () {
        const result = ge.evalValueSync('(foo | upcase)', { foo: 'bar' })
        return expect(result).toBe('BAR')
      })
      it('should support comparison via evalValueSync', function () {
        const result = ge.evalValueSync('(foo | upcase) == "BAR"', { foo: 'bar' })
        return expect(result).toBe(true)
      })
      it('should keep range syntax working', function () {
        const result = ge.evalValueSync('(1..5)', {})
        return expect(result).toEqual([1, 2, 3, 4, 5])
      })
      it('should support chained filters in condition', async function () {
        const src = '{% if (name | downcase | size) > 3 %}long{% else %}short{% endif %}'
        const html = await ge.parseAndRender(src, { name: 'Alice' })
        return expect(html).toBe('long')
      })
      it('should support real parenthesis grouping with comparisons and and', async function () {
        const src = '{% if (((name | downcase | size) > 3) and (one < three)) %}long{% else %}short{% endif %}'
        const html = await ge.parseAndRender(src, { name: 'Alice', one: 1, three: 3 })
        return expect(html).toBe('long')
      })
      it('should support nested parenthesized expressions in if condition', async function () {
        const src = '{% if ((foo | append: "!") | upcase) == "BAR!" %}match{% else %}no match{% endif %}'
        const html = await ge.parseAndRender(src, { foo: 'bar' })
        return expect(html).toBe('match')
      })
      it('should support or with grouped operands', async function () {
        const src = '{% if (a | upcase) == "X" or (b | upcase) == "B" %}yes{% else %}no{% endif %}'
        expect(await ge.parseAndRender(src, { a: 'z', b: 'b' })).toBe('yes')
      })
      it('should support not with a grouped operand', async function () {
        const src = '{% if not (a | upcase) == "B" %}no{% else %}yes{% endif %}'
        expect(await ge.parseAndRender(src, { a: 'b' })).toBe('yes')
      })
      it('should support contains with a grouped operand', async function () {
        const src = '{% if (csv | split: ",") contains "b" %}yes{% else %}no{% endif %}'
        expect(await ge.parseAndRender(src, { csv: 'a,b,c' })).toBe('yes')
      })
      it('should support property access on a grouped result', function () {
        expect(ge.evalValueSync('(items | first).name', { items: [{ name: 'Sally' }] })).toBe('Sally')
      })
      it('should support a grouped expression inside a bracket index', function () {
        expect(ge.evalValueSync('arr[(i | plus: 1)]', { arr: [10, 20, 30], i: 1 })).toBe(30)
      })
      it('should support an async filter inside a grouped expression', async function () {
        ge.registerFilter('asyncUpcase', (v: string) => Promise.resolve(String(v).toUpperCase()))
        const src = '{% if (name | asyncUpcase) == "BAR" %}yes{% else %}no{% endif %}'
        expect(await ge.parseAndRender(src, { name: 'bar' })).toBe('yes')
      })
    })
    describe('when disabled', function () {
      const ge = new Liquid({ groupedExpressions: false })
      it('should throw for parenthesized filter in condition', () => {
        const src = '{% if (foo | upcase) == "BAR" %}yes{% else %}no{% endif %}'
        expect(() => ge.parseAndRenderSync(src, { foo: 'bar' })).toThrow('invalid range syntax')
      })
      it('should throw for parenthesized filter via evalValueSync', () => {
        expect(() => ge.evalValueSync('(foo | upcase)', { foo: 'bar' })).toThrow('invalid range syntax')
      })
    })
  })
  describe('Ruby comparison, contains, and unknown operator semantics', function () {
    const inline = new Liquid({ inlineErrors: true, rubyNumbers: true })

    it('should raise comparison errors between numbers and strings', () => {
      expect(inline.parseAndRenderSync('{% if 5 > "x" %}hit{% endif %}')).toBe('Liquid error (line 1): comparison of Integer with String failed')
      expect(inline.parseAndRenderSync('{% if 1.0 < "a" %}hit{% endif %}')).toBe('Liquid error (line 1): comparison of Float with String failed')
      expect(inline.parseAndRenderSync('{% if "abc" < 1 %}hit{% endif %}')).toBe('Liquid error (line 1): comparison of String with 1 failed')
      expect(inline.parseAndRenderSync('{% if "hi" > 1.0 %}hit{% endif %}')).toBe('Liquid error (line 1): comparison of String with 1.0 failed')
    })

    it('should return false without error when comparing non-ordered types', () => {
      expect(inline.parseAndRenderSync('{% if 5 > true %}Y{% else %}N{% endif %}')).toBe('N')
      expect(inline.parseAndRenderSync('{% if a < b %}Y{% else %}N{% endif %}', { a: null, b: [1] })).toBe('N')
      expect(inline.parseAndRenderSync('{% if a < b %}Y{% else %}N{% endif %}', { a: false, b: [1] })).toBe('N')
      expect(inline.parseAndRenderSync('{% if a < b %}Y{% else %}N{% endif %}', { a: [1], b: [2] })).toBe('N')
    })

    it('should handle hash key membership and falsy targets in contains', () => {
      expect(inline.parseAndRenderSync('{% if h contains "a" %}y{% else %}n{% endif %}', { h: { a: 1 } })).toBe('y')
      expect(inline.parseAndRenderSync('{% if h contains 3 %}y{% else %}n{% endif %}', { h: { '3': 1 } })).toBe('n')
      expect(inline.parseAndRenderSync('{% if a contains false %}y{% else %}n{% endif %}', { a: [false] })).toBe('n')
      expect(inline.parseAndRenderSync('{% if a contains nil %}y{% else %}n{% endif %}', { a: [null] })).toBe('n')
    })

    it('should raise Unknown operator when evaluating a branch with an unknown operator', () => {
      expect(inline.parseAndRenderSync('{% if true true %}{% else %}1{% endif %}')).toBe('Liquid error (line 1): Unknown operator true')
      expect(inline.parseAndRenderSync('{% if false %}a{% elsif true true %}b{% endif %}')).toBe('Liquid error (line 1): Unknown operator true')
      expect(inline.parseAndRenderSync('{% if true %}a{% elsif true true %}b{% endif %}')).toBe('a')
      expect(inline.parseAndRenderSync('{% if blank foo %}1{% endif %}')).toBe('Liquid error (line 1): Unknown operator foo')
      expect(inline.parseAndRenderSync('{% if dynamic and true true %}a{% else %}b{% endif %}', { dynamic: false })).toBe('b')
      expect(inline.parseAndRenderSync('{% if dynamic and true true %}a{% else %}b{% endif %}', { dynamic: true })).toBe('Liquid error (line 1): Unknown operator true')
    })
  })
})
