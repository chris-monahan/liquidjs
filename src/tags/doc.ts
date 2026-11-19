import { Liquid, TopLevelToken, TagToken, Tag } from '..'
import { escapeRegExp } from '../util'

export default class extends Tag {
  private bodyLength = 0
  constructor (tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    if (!/^\s*$/.test(tagToken.args)) {
      throw new Error("Syntax Error in 'doc' - Valid syntax: {% doc %}{% enddoc %}")
    }
    const { tagDelimiterLeft, tagDelimiterRight } = liquid.options
    const nestedDocPattern = new RegExp(`${escapeRegExp(tagDelimiterLeft)}-?\\s*doc(?!\\w)`)
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (token instanceof TagToken) {
        if (token.name === 'enddoc') return
        if (token.name === 'doc') {
          throw new Error("Syntax Error in 'doc' - Nested doc tags are not allowed")
        }
      }
      const text = token.getText()
      const match = nestedDocPattern.exec(text)
      if (match && text.indexOf(tagDelimiterRight, match.index + match[0].length) !== -1) {
        throw new Error("Syntax Error in 'doc' - Nested doc tags are not allowed")
      }
      this.bodyLength += text.length
    }
    throw new Error("'doc' tag was never closed")
  }
  get blank () {
    return this.bodyLength === 0
  }
  render () {}
}
