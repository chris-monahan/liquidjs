import { Liquid } from '../../../src/liquid'
import { TagToken, TopLevelToken } from '../../../src/tokens'
import { isTagToken } from '../../../src/util'

describe('LiquidOptions#rawTags', function () {
  const liquid = new Liquid({ rawTags: ['raw', 'schema'] })
  liquid.registerTag('schema', {
    parse (token: TagToken, remainTokens: TopLevelToken[]) {
      this.content = ''
      for (let next = remainTokens.shift(); next; next = remainTokens.shift()) {
        if (isTagToken(next) && next.name === 'endschema') return
        this.content += next.getText()
      }
      throw new Error(`tag ${token.getText()} not closed`)
    },
    render () { return `[${this.content}]` }
  })

  it('should output content as-is', function () {
    const src = '{% schema %}{"visible_if": "{{ block.settings.a == \\"x\\" }}"}{% endschema %}'
    expect(liquid.parseAndRenderSync(src)).toBe('[{"visible_if": "{{ block.settings.a == \\"x\\" }}"}]')
  })
  it('should only end at its own end tag', function () {
    expect(liquid.parseAndRenderSync('{% schema %}{% raw %}{% endraw %}{% endschema %}')).toBe('[{% raw %}{% endraw %}]')
  })
  it('should support whitespace control', function () {
    expect(liquid.parseAndRenderSync('a {%- schema -%} b {%- endschema -%} c')).toBe('a[ b ]c')
  })
  it('should throw when not closed', function () {
    expect(() => liquid.parse('{% schema %}{ "a": 1 }')).toThrow(/schema "{% schema %}.*" not closed/)
  })
  it('should keep raw as the default', function () {
    expect(() => new Liquid().parse('{% schema %}{{ "a\\" }}{% endschema %}')).toThrow()
    expect(new Liquid().parseAndRenderSync('{% raw %}{{ a }}{% endraw %}')).toBe('{{ a }}')
  })
})
