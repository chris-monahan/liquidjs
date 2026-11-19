import { Liquid, Tag, Template, Context, Emitter, TagToken, TopLevelToken } from '..'
import { SimpleEmitter } from '../emitters'
import { Parser } from '../parser'
import { isTagToken } from '../util'

export default class extends Tag {
  templates: Template[] = []
  constructor (tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (isTagToken(token) && token.name === 'endifchanged') return
      this.templates.push(parser.parseToken(token, remainTokens))
    }
    throw new Error(`tag ${tagToken.getText()} not closed`)
  }

  get blank () {
    return this.templates.every(t => 'blank' in t && (t as any).blank)
  }

  * render (ctx: Context, emitter: Emitter): Generator<unknown, void, string> {
    const rendered = yield this.liquid.renderer.renderTemplates(this.templates, ctx, new SimpleEmitter())
    if (rendered !== ctx.getRegister('ifchanged')) {
      ctx.setRegister('ifchanged', rendered)
      emitter.write(rendered)
    }
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }
}
