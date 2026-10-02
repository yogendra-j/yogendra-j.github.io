---
title: Writing
description: Articles by Yogendra Jaiswal on backend reliability, SQL isolation, idempotent APIs, Redis, TypeScript, and building and verifying AI coding agents.
seo:
  type: CollectionPage
icon: fas fa-pen-to-square
order: 2
---

{% assign posts = site.posts | where_exp: 'post', 'post.hidden != true' %}
<ol class="post-index">
  {% for post in posts %}
    <li>
      <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%b %Y' }}</time>
      <div>
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
        <p>{{ post.description | strip_html | escape }}</p>
      </div>
    </li>
  {% endfor %}
</ol>
