import { Liquid } from '../../../src/liquid'

describe('tags/cycle', function () {
  const liquid = new Liquid()

  it('should support cycle', async function () {
    const src = "{% cycle '1', '2', '3' %}"
    const html = await liquid.parseAndRender(src + src + src + src)
    return expect(html).toBe('1231')
  })

  it('should throw when cycle candidates empty', function () {
    return expect(liquid.parseAndRender('{%cycle%}'))
      .rejects.toThrow('empty candidates: "{%cycle%}", line:1, col:8')
  })

  it('should support cycle in for block', async function () {
    const src = '{% for i in (1..5) %}{% cycle one, "e"%}{% endfor %}'
    const ctx = {
      one: 1
    }
    const html = await liquid.parseAndRender(src, ctx)
    return expect(html).toBe('1e1e1')
  })

  it('should considered different groups for different arguments', async function () {
    const src = "{% cycle '1', '2', '3'%}" +
            "{% cycle '1', '2'%}" +
            "{% cycle '1', '2', '3'%}"
    const html = await liquid.parseAndRender(src)
    return expect(html).toBe('112')
  })

  it('should support cycle group', async function () {
    const src = "{% cycle one: '1', '2', '3'%}" +
            "{% cycle 1: '1', '2', '3'%}" +
            "{% cycle 2: '1', '2', '3'%}"
    const ctx = { one: 1 }
    const html = await liquid.parseAndRender(src, ctx)
    return expect(html).toBe('121')
  })
  it('should support sync', function () {
    const src = "{% cycle '1', '2', '3' %}"
    const html = liquid.parseAndRenderSync(src + src + src + src)
    return expect(html).toBe('1231')
  })

  it('should render falsy literal values', async function () {
    expect(await liquid.parseAndRender('{% cycle true, false %}{% cycle true, false %}')).toBe('truefalse')
    expect(await liquid.parseAndRender('{% cycle 0, 1 %}{% cycle 0, 1 %}')).toBe('01')
  })

  it('should keep separate counters for distinct unnamed variable cycle tags', async function () {
    expect(await liquid.parseAndRender("{% assign x = '1' %}{% cycle x, '2' %}{% cycle x, '2' %}")).toBe('11')
    expect(await liquid.parseAndRender("{% assign x = '1' %}{% for i in (1..4) %}{% cycle x, '2' %}{% endfor %}")).toBe('1212')
  })

  it('should share counter for identical unnamed literal cycles across quote styles', async function () {
    expect(await liquid.parseAndRender('{% cycle \'a\', \'b\' %}{% cycle "a", "b" %}')).toBe('ab')
    expect(await liquid.parseAndRender("{% cycle '1', '2' %}{% cycle 1, 2 %}")).toBe('11')
  })

  it('should share named cycle counter by group value alone', async function () {
    expect(await liquid.parseAndRender("{% cycle 'g': 'a', 'b', 'c' %}{% cycle 'g': 'x', 'y' %}{% cycle 'g': 'x', 'y' %}")).toBe('ayx')
    expect(await liquid.parseAndRender("{% cycle 'g': 'a', 'b', 'c' %}{% cycle 'g': 'a', 'b', 'c' %}{% cycle 'g': 'x', 'y' %}{% cycle 'g': 'x', 'y' %}")).toBe('abx')
    expect(await liquid.parseAndRender("{% cycle 1: 'a', 'b' %}{% cycle '1': 'a', 'b' %}{% cycle 1: 'a', 'b' %}{% cycle '1': 'a', 'b' %}")).toBe('aabb')
  })
})
