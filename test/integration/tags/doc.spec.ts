import { Liquid } from '../../../src/liquid'
import { DocTag } from '../../../src/tags'

describe('tags/doc', function () {
  const liquid = new Liquid()

  it('should not render content inside doc tag', async function () {
    expect(await liquid.parseAndRender('{% doc %}hidden {{ x }}{% enddoc %}shown', { x: 1 })).toBe('shown')
    expect(liquid.parseAndRenderSync('{% doc %}hidden {{ x }}{% enddoc %}shown', { x: 1 })).toBe('shown')
  })

  it('should ignore invalid or unparsed Liquid syntax inside doc', function () {
    expect(liquid.parseAndRenderSync('{% doc %}{{ unclosed{% enddoc %}')).toBe('')
    expect(liquid.parseAndRenderSync('{% doc %}{% unknown_tag %}{% enddoc %}')).toBe('')
    expect(liquid.parseAndRenderSync('{% doc %}{% if true %}{% enddoc %}')).toBe('')
    expect(liquid.parseAndRenderSync('{% doc %}{% raw %}{% enddoc %}')).toBe('')
    expect(liquid.parseAndRenderSync('{% doc %}{{ "a\\" }}{% enddoc %}')).toBe('')
  })

  it('should support whitespace control', function () {
    expect(liquid.parseAndRenderSync('a  {%- doc -%}  inner  {%- enddoc -%}  b')).toBe('ab')
    expect(liquid.parseAndRenderSync('a  {%- doc %}  inner  {% enddoc -%}  b')).toBe('ab')
    expect(liquid.parseAndRenderSync('a {% doc -%} inner {%- enddoc %} b')).toBe('a  b')
  })

  it('should allow trailing text on enddoc', function () {
    expect(liquid.parseAndRenderSync('{% doc %}body{% enddoc extra %}after')).toBe('after')
  })

  it('should throw on arguments in opening doc tag', function () {
    expect(() => liquid.parse('{% doc extra %}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Valid syntax: {% doc %}{% enddoc %}"
    )
  })

  it('should throw on nested doc tags', function () {
    expect(() => liquid.parse('{% doc %}{% doc %}{% enddoc %}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
    expect(() => liquid.parse('{% doc %}{%- doc -%}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
    expect(() => liquid.parse('{% doc %}{% doc extra %}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
    expect(() => liquid.parse('{% doc %}{%- doc-%}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
    const nonRawLiquid = new Liquid({ rawTags: ['raw'] })
    expect(() => nonRawLiquid.parse('{% doc %}{% doc %}{% enddoc %}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
    const customDelimLiquid = new Liquid({ tagDelimiterLeft: '[%', tagDelimiterRight: '%]' })
    expect(() => customDelimLiquid.parse('[% doc %][% doc %][% enddoc %][% enddoc %]')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
  })

  it('should allow tag names starting with doc', function () {
    expect(liquid.parseAndRenderSync('{% doc %}{% doc_helper %}{% enddoc %}')).toBe('')
    expect(liquid.parseAndRenderSync('{% doc %}{%- docEXTRA -%}{% enddoc %}')).toBe('')
  })

  it('should throw when doc tag is unclosed', function () {
    expect(() => liquid.parse('{% doc %}')).toThrow("'doc' tag was never closed")
    expect(() => liquid.parse('{% doc %}unclosed')).toThrow()
    expect(() => liquid.parse('{% liquid\n  doc\n  enddoc\n%}')).toThrow("'doc' tag was never closed")
  })

  it('should expose blank property', function () {
    const emptyDoc = liquid.parse('{% doc %}{% enddoc %}')[0] as DocTag
    expect(emptyDoc.blank).toBe(true)

    const nonEmptyDoc = liquid.parse('{% doc %}hello{% enddoc %}')[0] as DocTag
    expect(nonEmptyDoc.blank).toBe(false)

    const whitespaceDoc = liquid.parse('{% doc %} {% enddoc %}')[0] as DocTag
    expect(whitespaceDoc.blank).toBe(false)
  })
})
