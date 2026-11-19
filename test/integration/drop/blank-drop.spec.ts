import { Liquid } from '../../../src/liquid'
import { analyzeSync } from '../../../src/template'

describe('drop/blank-drop', function () {
  let liquid: Liquid
  beforeEach(() => (liquid = new Liquid()))

  it('render blank drop as blank string', async function () {
    const html = await liquid.parseAndRender('{{blank}}')
    expect(html).toBe('')
  })
  it('blank equals nil', async function () {
    const src = '{%if blank == nil %}blank == nil{%else%}blank != nil{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('blank == nil')
  })
  it('false is blank', async function () {
    const src = '{%if false == blank %}false == blank{%else%}false != blank{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false == blank')
  })
  it('"" is blank', async function () {
    const src = '{%if "" == blank %}"" == blank{%else%}"" != blank{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('"" == blank')
  })
  it('"  " is blank', async function () {
    const src = '{%if "  " == blank %}"  " == blank{%else%}"  " != blank{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('"  " == blank')
  })
  it('{} is blank', async function () {
    const src = '{%if obj == blank %}{} == blank{%else%}{} != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { obj: {} })
    expect(html).toBe('{} == blank')
  })
  it('{foo: 1} is not blank', async function () {
    const src = '{%if obj == blank %}{foo: 1} == blank{%else%}{foo: 1} != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { obj: { foo: 1 } })
    expect(html).toBe('{foo: 1} != blank')
  })
  it('[] is blank', async function () {
    const src = '{%if arr == blank %}[] == blank{%else%}[] != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { arr: [] })
    expect(html).toBe('[] == blank')
  })
  it('[1] is not blank', async function () {
    const src = '{%if arr == blank %}[1] == blank{%else%}[1] != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { arr: [1] })
    expect(html).toBe('[1] != blank')
  })
  it('resolves property lookup on variable named blank', async function () {
    const html = await liquid.parseAndRender('{{ blank.foo }}', { blank: { foo: 'F' } })
    expect(html).toBe('F')
  })
  it('resolves property lookup on variables named true and nil', async function () {
    const html = await liquid.parseAndRender('{{ true.foo }}{{ nil.foo }}', { true: { foo: 'T' }, nil: { foo: 'N' } })
    expect(html).toBe('TN')
  })
  it('evaluates standalone blank as literal even when blank is in scope or assigned', async function () {
    expect(await liquid.parseAndRender('{{ blank }}', { blank: { foo: 'F' } })).toBe('')
    expect(await liquid.parseAndRender("{% assign blank = 'hi' %}{{ blank }}")).toBe('')
  })
  it('compares against BlankDrop even when blank is in scope', async function () {
    const src = '{% if x == blank %}blank{% else %}not blank{% endif %}'
    const html = await liquid.parseAndRender(src, { x: '', blank: 'non-blank' })
    expect(html).toBe('blank')
  })
  it('records blank in static analysis for blank.foo', function () {
    const analysis = analyzeSync(liquid.parse('{{ blank.foo }}'))
    expect(Object.keys(analysis.variables)).toEqual(['blank'])
    expect(Object.keys(analysis.globals)).toEqual(['blank'])
    expect(analysis.variables.blank[0].segments).toEqual(['blank', 'foo'])
  })
})
