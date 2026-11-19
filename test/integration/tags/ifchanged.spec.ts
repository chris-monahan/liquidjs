import { Liquid } from '../../../src/liquid'
import { IfchangedTag } from '../../../src/tags'

describe('tags/ifchanged', function () {
  const liquid = new Liquid()

  it('should output only when rendered content changes (async)', async function () {
    const src = '{% for item in items %}{% ifchanged %}{{ item }}{% endifchanged %}{% endfor %}'
    const html = await liquid.parseAndRender(src, { items: [1, 1, 2, 2, 1] })
    expect(html).toBe('121')
  })

  it('should output only when rendered content changes (sync)', function () {
    const src = '{% for item in items %}{% ifchanged %}{{ item }}{% endifchanged %}{% endfor %}'
    const html = liquid.parseAndRenderSync(src, { items: [1, 1, 2, 2, 1] })
    expect(html).toBe('121')
  })

  it('should await async values inside ifchanged', async function () {
    const engine = new Liquid()
    engine.registerFilter('asyncVal', (v: number) => Promise.resolve(v))
    const src = '{% for item in items %}{% ifchanged %}{{ item | asyncVal }}{% endifchanged %}{% endfor %}'
    const html = await engine.parseAndRender(src, { items: [1, 1, 2, 2, 1] })
    expect(html).toBe('121')
  })

  it('should share register state across multiple ifchanged blocks in the same loop', async function () {
    const sameSrc = '{% for item in items %}{% ifchanged %}{{ item }}{% endifchanged %}{% ifchanged %}{{ item }}{% endifchanged %}{% endfor %}'
    expect(await liquid.parseAndRender(sameSrc, { items: [1, 2] })).toBe('12')

    const altSrc = '{% for item in items %}{% ifchanged %}a{% endifchanged %}{% ifchanged %}b{% endifchanged %}{% endfor %}'
    expect(await liquid.parseAndRender(altSrc, { items: [1, 2] })).toBe('abab')
  })

  it('should share ifchanged state across include but isolate it in render', async function () {
    const engine = new Liquid({
      templates: {
        part: '{% ifchanged %}{{ item }}{% endifchanged %}'
      }
    })
    const includeSrc = '{% ifchanged %}1{% endifchanged %}{% for item in items %}{% include "part" %}{% endfor %}'
    expect(await engine.parseAndRender(includeSrc, { items: [1, 1, 2, 2, 1] })).toBe('121')

    const renderSrc = '{% ifchanged %}1{% endifchanged %}{% for item in items %}{% render "part", item: item %}{% endfor %}'
    expect(await engine.parseAndRender(renderSrc, { items: [1, 1, 2] })).toBe('1112')
  })

  it('should handle break inside ifchanged in a for loop', async function () {
    const src = '{% for item in items %}{% ifchanged %}{{ item }}{% if item == 2 %}{% break %}{% endif %}x{% endifchanged %}!{% endfor %}'
    expect(await liquid.parseAndRender(src, { items: [1, 1, 2, 3] })).toBe('1x!!2')

    const unchangedBeforeBreak = '{% for item in items %}{% ifchanged %}a{% if item == 2 %}{% break %}{% endif %}{% endifchanged %}{{ item }}{% endfor %}'
    expect(await liquid.parseAndRender(unchangedBeforeBreak, { items: [1, 2, 3] })).toBe('a1')
  })

  it('should handle continue inside ifchanged in a for loop', async function () {
    const src = '{% for item in items %}{% ifchanged %}{{ item }}{% if item == 2 %}{% continue %}{% endif %}x{% endifchanged %}!{% endfor %}'
    expect(await liquid.parseAndRender(src, { items: [1, 2, 2, 3] })).toBe('1x!23x!')
  })

  it('should support ifchanged inside liquid tag', async function () {
    const src = `{%- liquid
      for item in items
        ifchanged
          echo item
        endifchanged
      endfor
    -%}`
    expect(await liquid.parseAndRender(src, { items: [1, 1, 2, 2, 3, 1] })).toBe('1231')
  })

  it('should throw when ifchanged is not closed', function () {
    const src = '{% ifchanged %}hello'
    return expect(liquid.parseAndRender(src))
      .rejects.toThrow(/tag {% ifchanged %} not closed/)
  })

  it('should traverse variables inside ifchanged during static analysis', function () {
    const template = liquid.parse('{% ifchanged %}{{ a }}{{ b.c }}{% endifchanged %}')
    const analysis = liquid.analyzeSync(template)
    expect(Object.keys(analysis.variables)).toStrictEqual(['a', 'b'])
    expect(Object.keys(analysis.globals)).toStrictEqual(['a', 'b'])
  })

  it('should report blank based on child templates', function () {
    const [emptyBlock] = liquid.parse('{% ifchanged %}{% ifchanged %}{% endifchanged %}{% endifchanged %}') as IfchangedTag[]
    const [nonBlankBlock] = liquid.parse('{% ifchanged %}{% ifchanged %}{{ a }}{% endifchanged %}{% endifchanged %}') as IfchangedTag[]
    expect(emptyBlock.blank).toBe(true)
    expect(nonBlankBlock.blank).toBe(false)
  })
})
