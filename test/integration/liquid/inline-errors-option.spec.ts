import { Liquid, LiquidRuntimeError, LiquidError, InlineError } from '../../../src'

describe('LiquidOptions#inlineErrors', function () {
  function engine (options = {}) {
    const liquid = new Liquid({
      inlineErrors: true,
      templates: { bad_partial: 'before {{ 1 | boom }} after', nested: '[{% render "bad_partial" %}]' },
      ...options
    })
    liquid.registerFilter('boom', () => { throw new LiquidRuntimeError('boom') })
    liquid.registerFilter('bug', () => { throw new TypeError('x.foo is not a function') })
    return liquid
  }
  const render = (tpl: string, options = {}, scope = {}, errors?: LiquidError[]) =>
    engine(options).parseAndRenderSync(tpl, scope, { errors })

  it('is off by default', function () {
    expect(() => engine({ inlineErrors: false }).parseAndRenderSync('{{ 1 | boom }}')).toThrow('boom')
  })

  it('renders the error in place and keeps going', function () {
    expect(render('a {{ 1 | boom }} b\n{{ 2 | boom }} c')).toBe('a Liquid error (line 1): boom b\nLiquid error (line 2): boom c')
  })

  it('fails each node on its own, inside blocks and loops', function () {
    expect(render('{% for i in (1..3) %}{{ i }}{{ i | boom }}{% if i == 2 %}{% break %}{% endif %}{% endfor %}!'))
      .toBe('1Liquid error (line 1): boom2Liquid error (line 1): boom!')
  })

  it('names the partial an error came from', function () {
    expect(render('{% render "nested" %}')).toBe('[before Liquid error (bad_partial line 1): boom after]')
  })

  it('prints exceptions that are not Liquid errors as internal', function () {
    expect(render('{{ 1 | bug }}')).toBe('Liquid error (line 1): internal')
  })

  it('treats a missing partial as a Liquid error', function () {
    expect(render('{% render "nope" %}')).toMatch(/^Liquid error \(line 1\): ENOENT: Failed to lookup "nope"/)
  })

  it('collects every error, with the original exception', function () {
    const errors: LiquidError[] = []
    render('{{ 1 | bug }}{% render "nested" %}', {}, {}, errors)
    expect(errors.map(e => e.originalError?.message)).toEqual(['x.foo is not a function', 'boom'])
  })

  it('records strict-mode undefined variables without printing them', function () {
    const errors: LiquidError[] = []
    expect(render('[{{ nope }}]', { strictVariables: true }, {}, errors)).toBe('[]')
    expect(errors).toHaveLength(1)
  })

  it('still aborts on resource limits', function () {
    expect(() => render('{% for i in (1..100) %}{{ i }}{% endfor %}', { memoryLimit: 10 })).toThrow('memory alloc limit exceeded')
  })

  it('accepts a custom formatter', function () {
    const formatError = ({ message, line }: InlineError) => `<!-- ${line}: ${message} -->`
    expect(render('{{ 1 | boom }}', { formatError })).toBe('<!-- 1: boom -->')
  })

  describe('suppressBlankTagErrors', function () {
    const suppressed = { suppressBlankTagErrors: true }
    it('prints nothing for errors in blank tags', function () {
      expect(render('[{% assign a = 1 | boom %}]', suppressed)).toBe('[]')
      expect(render('[{% if true %} {% assign a = 1 | boom %} {% endif %}]', suppressed)).toBe('[  ]')
    })
    it('still records them', function () {
      const errors: LiquidError[] = []
      render('{% assign a = 1 | boom %}', suppressed, {}, errors)
      expect(errors).toHaveLength(1)
    })
    it('prints errors from output and non-blank tags', function () {
      expect(render('{% echo 1 | boom %}|{% capture c %}{{ 1 | boom }}{% endcapture %}{{ c }}', suppressed))
        .toBe('Liquid error (line 1): boom|Liquid error (line 1): boom')
    })
    it('is off by default, as in strict2', function () {
      expect(render('[{% assign a = 1 | boom %}]')).toBe('[Liquid error (line 1): boom]')
    })
  })
})
