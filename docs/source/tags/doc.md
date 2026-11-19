---
title: doc
---

{% since %}v10.31.0{% endsince %}

Documents template elements such as parameters and examples. Content inside a `doc` block is not rendered, and Liquid syntax inside it is not parsed or executed (unlike [comment][comment], which still requires well-formed Liquid delimiters). Nested `doc` tags are not allowed.

Input
```liquid
{%- doc -%}
  Renders a greeting message.

  @param {string} [name] - The person to greet
  @example
  {% render 'greeting', name: 'Shopify' %}
{%- enddoc -%}
Hello, {{ name | default: 'World' }}!
```

Output
```text
Hello, World!
```

[comment]: ./comment.html
