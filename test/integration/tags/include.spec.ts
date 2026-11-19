import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop/drop'
import { mock, restore } from '../../stub/mockfs'

describe('tags/include', function () {
  let liquid: Liquid
  beforeEach(function () {
    liquid = new Liquid({
      root: '/',
      extname: '.html'
    })
  })
  afterEach(restore)
  it('should support include', async function () {
    mock({
      '/current.html': 'bar{% include "bar/foo.html" %}bar',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html')
    return expect(html).toBe('barfoobar')
  })
  it('should support relative reference', async function () {
    mock({
      '/foo/bar/current.html': 'bar{% include "../coo/foo.html" %}bar',
      '/foo/coo/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/foo/bar/current.html')
    return expect(html).toBe('barfoobar')
  })
  it('should support template string', async function () {
    mock({
      '/current.html': 'bar{% include "bar/{{name}}" %}bar',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html', { name: 'foo.html' })
    return expect(html).toBe('barfoobar')
  })
  it('should allow escape in template string', async function () {
    mock({
      '/current.html': 'bar{% include "bar/{{name | append: \\".html\\"}}" %}bar',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html', { name: 'foo' })
    return expect(html).toBe('barfoobar')
  })

  it('should throw when not specified', function () {
    mock({
      '/parent.html': '{%include , %}'
    })
    return liquid.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('TokenizationError')
      expect(e.message).toMatch(/illegal file path, file:.*parent.html, line:1, col:11/)
    })
  })

  it('should throw when not exist', function () {
    mock({
      '/parent.html': '{%include not-exist%}'
    })
    return liquid.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('RenderError')
      expect(e.message).toMatch(/Argument error in tag 'include' - Illegal template name/)
    })
  })

  it('should throw illegal template name for non-string names and pass empty string to lookup', async function () {
    mock({})
    await expect(liquid.parseAndRender('{% include nil %}')).rejects.toThrow("Argument error in tag 'include' - Illegal template name")
    await expect(liquid.parseAndRender('{% include 123 %}')).rejects.toThrow("Argument error in tag 'include' - Illegal template name")
    await expect(liquid.parseAndRender('{% include true %}')).rejects.toThrow("Argument error in tag 'include' - Illegal template name")
    await expect(liquid.parseAndRender('{% include "" %}')).rejects.toThrow(/Failed to lookup ""/)
  })

  it('should support include with relative path', async function () {
    mock({
      '/bar/foo.html': 'foo',
      '/foo/relative.html': 'bar{% include "../bar/foo.html" %}bar'
    })
    const html = await liquid.renderFile('foo/relative.html')
    return expect(html).toBe('barfoobar')
  })

  it('should support include: hash list', async function () {
    mock({
      '/hash.html': '{% assign name="harttle" %}{% include "user.html", role: "admin", alias: name %}',
      '/user.html': '{{name}} : {{role}} : {{alias}}'
    })
    const html = await liquid.renderFile('hash.html')
    return expect(html).toBe('harttle : admin : harttle')
  })

  it('should support include: parent scope', async function () {
    mock({
      '/scope.html': '{% assign shape="triangle" %}{% assign color="yellow" %}{% include "color.html" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('scope.html')
    return expect(html).toBe('color:yellow, shape:triangle')
  })

  it('should support include: with', async function () {
    mock({
      '/with.html': '{% include "color" with "red", shape: "rect" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('with.html')
    return expect(html).toBe('color:red, shape:rect')
  })
  it('should support include: with...as and partial basename default', async function () {
    mock({
      '/item.html': '[{{ thing }}]',
      '/snippets/card.html': '[{{ card }}]'
    })
    expect(await liquid.parseAndRender("{% include 'item' with featured as thing %}", { featured: 'F' })).toBe('[F]')
    expect(await liquid.parseAndRender("{% include 'snippets/card' with featured %}", { featured: 'C' })).toBe('[C]')
  })
  it('should support include: for and for...as without creating forloop', async function () {
    mock({
      '/item.html': '[{{ item }}:{{ forloop.index }}]',
      '/aliased.html': '[{{ thing }}:{{ forloop.index }}]'
    })
    expect(await liquid.parseAndRender("{% include 'item' for items %}", { items: ['a', 'b'] })).toBe('[a:][b:]')
    expect(await liquid.parseAndRender("{% include 'aliased' for items as thing %}", { items: ['a', 'b'] })).toBe('[a:][b:]')
    expect(await liquid.parseAndRender("{% include 'item' for empty_items %}", { empty_items: [] })).toBe('')
    expect(await liquid.parseAndRender("{% for x in (1..2) %}{% include 'item' for items %}{% endfor %}", { items: ['a', 'b'] })).toBe('[a:1][b:1][a:2][b:2]')
  })
  it('should share assign scope across include for iterations and propagate break/continue to outer for', async function () {
    mock({
      '/acc.html': '{% assign count = count | default: 0 | plus: 1 %}{{ count }}:{{ acc }};',
      '/brk.html': '[{{ brk }}]{% if brk == 2 %}{% break %}{% endif %}',
      '/cnt.html': '[{{ cnt }}]{% if cnt == 2 %}{% continue %}{% endif %}'
    })
    expect(await liquid.parseAndRender("{% include 'acc' for items %}{{ count }}", { items: ['a', 'b'] })).toBe('1:a;2:b;2')
    expect(await liquid.parseAndRender("{% for x in (1..2) %}({{ x }}:{% include 'brk' for items %}!){% endfor %}", { items: [1, 2, 3] })).toBe('(1:[1][2]')
    expect(await liquid.parseAndRender("{% for x in (1..2) %}({{ x }}:{% include 'cnt' for items %}!){% endfor %}", { items: [1, 2, 3] })).toBe('(1:[1][2](2:[1][2]')
  })
  it('should iterate arrays in with and not iterate non-arrays in for', async function () {
    mock({
      '/item.html': '[{{ item }}]'
    })
    expect(await liquid.parseAndRender("{% include 'item' with items %}", { items: ['a', 'b'] })).toBe('[a][b]')
    expect(await liquid.parseAndRender("{% include 'item' for (1..3) %}")).toBe('[123]')
    expect(await liquid.parseAndRender("{% include 'item' for 'abc' %}")).toBe('[abc]')
  })
  it('should evaluate keyword arguments sequentially in included scope', async function () {
    mock({
      '/item.html': '{{ a }}{{ b }}',
      '/with_item.html': '{{ item }}-{{ a }}-{{ b }}'
    })
    expect(await liquid.parseAndRender("{% include 'item' a: 1, b: a %}")).toBe('11')
    expect(await liquid.parseAndRender("{% include 'with_item' with b as item, a: 1, b: a %}", { b: 'outer' })).toBe('outer-1-1')
  })
  it('should disallow include inside render while allowing sibling include', async function () {
    mock({
      '/rendered.html': "{% include 'sub' %}",
      '/ok.html': 'R',
      '/sub.html': 'I'
    })
    await expect(liquid.parseAndRender("{% render 'rendered' %}")).rejects.toThrow('include usage is not allowed in this context')
    expect(await liquid.parseAndRender("{% render 'ok' %}-{% include 'sub' %}")).toBe('R-I')
  })
  it('should ignore if with value not specified', async function () {
    mock({
      '/with.html': '{% include "color" with, shape: "rect" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('with.html')
    return expect(html).toBe('color:, shape:rect')
  })
  it('should treat with as a valid key', async function () {
    mock({
      '/with.html': '{% include "color" with: "foo" %}',
      '/color.html': 'with:{{with}}'
    })
    const html = await liquid.renderFile('with.html')
    return expect(html).toBe('with:foo')
  })
  it('should support include: with as Drop', async function () {
    class ColorDrop extends Drop {
      public valueOf (): string {
        return 'red!'
      }
    }
    mock({
      '/with.html': '{% include "color" with color %}',
      '/color.html': 'color:{{color}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('color:red!')
  })
  it('should support include: with passed as Drop', async function () {
    class ColorDrop extends Drop {
      public valueOf (): string {
        return 'red!'
      }
    }
    liquid.registerFilter('name', x => x.constructor.name)
    mock({
      '/with.html': '{% include "color" with color %}',
      '/color.html': '{{color | name}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('ColorDrop')
  })
  it('should await async valueOf when the included Drop is output', async function () {
    class ColorDrop extends Drop {
      label = 'blue'
      public async valueOf () {
        return 'red!'
      }
    }
    liquid.registerFilter('name', x => x.constructor.name)
    mock({
      '/with.html': '{% include "color" with color %}',
      '/color.html': '{{color.label}}:{{color}}:{{color | name}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('blue:red!:ColorDrop')
  })

  it('should support nested includes', async function () {
    mock({
      '/personInfo.html': 'This is a person {% include "card.html" %}',
      '/card.html': '<p>{{person.firstName}} {{person.lastName}}<br/>{% include "address" %}</p>',
      '/address.html': 'City: {{person.address.city}}'
    })
    const ctx = {
      person: {
        firstName: 'Joe',
        lastName: 'Shmoe',
        address: {
          city: 'Dallas'
        }
      }
    }
    const html = await liquid.renderFile('personInfo.html', ctx)
    return expect(html).toBe('This is a person <p>Joe Shmoe<br/>City: Dallas</p>')
  })

  describe('static partial', function () {
    it('should support filename with extension', async function () {
      mock({
        '/parent.html': 'X{% include child.html color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const staticLiquid = new Liquid({ dynamicPartials: false, root: '/' })
      const html = await staticLiquid.renderFile('parent.html')
      return expect(html).toBe('Xchild with redY')
    })

    it('should support parent paths', async function () {
      mock({
        '/parent.html': 'X{% include bar/./../foo/child.html %}Y',
        '/foo/child.html': 'child'
      })
      const staticLiquid = new Liquid({ dynamicPartials: false, root: '/' })
      const html = await staticLiquid.renderFile('parent.html')
      return expect(html).toBe('XchildY')
    })

    it('should support subpaths', async function () {
      mock({
        '/parent.html': 'X{% include foo/child.html %}Y',
        '/foo/child.html': 'child'
      })
      const staticLiquid = new Liquid({ dynamicPartials: false, root: '/' })
      const html = await staticLiquid.renderFile('parent.html')
      return expect(html).toBe('XchildY')
    })

    it('should support comma separated arguments', async function () {
      mock({
        '/parent.html': 'X{% include child.html, color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const staticLiquid = new Liquid({ dynamicPartials: false, root: '/' })
      const html = await staticLiquid.renderFile('parent.html')
      return expect(html).toBe('Xchild with redY')
    })

    it('should support single liquid output', async function () {
      mock({
        '/parent.html': 'X{% include {{child}}, color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const staticLiquid = new Liquid({ dynamicPartials: false, root: '/' })
      const html = await staticLiquid.renderFile('parent.html', { child: 'child.html' })
      return expect(html).toBe('Xchild with redY')
    })
  })
  describe('sync support', function () {
    it('should support quoted string', function () {
      mock({
        '/current.html': 'bar{% include "bar/foo.html" %}bar',
        '/bar/foo.html': 'foo'
      })
      const html = liquid.renderFileSync('/current.html')
      return expect(html).toBe('barfoobar')
    })
    it('should support variable', function () {
      mock({
        '/current.html': 'bar{% include name %}bar',
        '/bar/foo.html': 'foo'
      })
      const html = liquid.renderFileSync('/current.html', { name: '/bar/foo.html' })
      return expect(html).toBe('barfoobar')
    })
    it('should support include: with', function () {
      mock({
        '/with.html': '{% include "color" with "red", shape: "rect" %}',
        '/color.html': 'color:{{color}}, shape:{{shape}}'
      })
      const html = liquid.renderFileSync('with.html')
      return expect(html).toBe('color:red, shape:rect')
    })
    it('should support filename with extension', function () {
      mock({
        '/parent.html': 'X{% include child.html color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const staticLiquid = new Liquid({ dynamicPartials: false, root: '/' })
      const html = staticLiquid.renderFileSync('parent.html')
      return expect(html).toBe('Xchild with redY')
    })
  })

  describe('Jekyll include', function () {
    beforeEach(function () {
      liquid = new Liquid({
        root: '/',
        extname: '.html',
        jekyllInclude: true
      })
    })
    it('should support Jekyll style include', function () {
      mock({
        '/current.html': '{% include bar/foo.html content="FOO" %}',
        '/bar/foo.html': '{{include.content}}-{{content}}'
      })
      const html = liquid.renderFileSync('/current.html')
      return expect(html).toBe('FOO-')
    })
    it('should support Jekyll style include with other whitespace before filename', function () {
      mock({
        '/current.html': '{% include bar/foo.html\r\n\ntitle="TITLE"\tcontent="FOO" %}',
        '/bar/foo.html': '{{include.title}}={{include.content}}-{{content}}'
      })
      const html = liquid.renderFileSync('/current.html')
      return expect(html).toBe('TITLE=FOO-')
    })
    it('should support multiple parameters', function () {
      mock({
        '/current.html': '{% include bar/foo.html header="HEADER" content="CONTENT" %}',
        '/bar/foo.html': '<h2>{{include.header}}</h2>{{include.content}}'
      })
      const html = liquid.renderFileSync('/current.html')
      return expect(html).toBe('<h2>HEADER</h2>CONTENT')
    })
    it('should support dynamicPartials=true', function () {
      mock({
        '/current.html': '{% include "bar/foo.html" content="FOO" %}',
        '/bar/foo.html': '{{include.content}}-{{content}}'
      })
      liquid = new Liquid({
        root: '/',
        extname: '.html',
        jekyllInclude: true,
        dynamicPartials: true
      })
      const html = liquid.renderFileSync('/current.html')
      return expect(html).toBe('FOO-')
    })
  })
})
