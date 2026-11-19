---
title: ifchanged
---

{% since %}v10.31.0{% endsince %}

Outputs the contents of a block only if the rendered output has changed since the last time `ifchanged` was evaluated. It is commonly used inside a `for` loop.

Input
```liquid
{% assign list = "1,3,2,3,3,2,2,3" | split: "," %}
{% for item in list -%}
  {%- ifchanged %} {{ item }}{% endifchanged -%}
{%- endfor %}
```

Output
```text
 1 3 2 3 2 3
```

Multiple `ifchanged` blocks within the same rendering context share the last rendered output:

Input
```liquid
{% for item in (1..2) -%}
  {%- ifchanged %}a{% endifchanged -%}
  {%- ifchanged %}a{% endifchanged -%}
{%- endfor %}
```

Output
```text
a
```
