---
title: Projects
description: Case studies by Yogendra Jaiswal on an enterprise AI workflow platform, an OpenCode agent orchestrator, and benchmarking coding agents on real pull requests.
icon: fas fa-diagram-project
order: 1
---

<ol class="work-list">
  {% for item in site.data.work.selected %}
    <li>
      <a class="work-card" href="{{ item.url | relative_url }}">
        <span class="work-meta">{{ item.meta }}</span>
        <span class="work-title">{{ item.title }}</span>
        <span class="work-summary">{{ item.summary }}</span>
        <span class="work-facts">{{ item.facts | join: ' · ' }}</span>
      </a>
    </li>
  {% endfor %}
</ol>

## Open source

<ul class="project-list">
  {% for repo in site.data.work.open_source %}
    <li>
      <a href="{{ repo.url }}">{{ repo.name }}</a>{% if repo.live_url %} · <a href="{{ repo.live_url }}">live demo</a>{% endif %}
      <p>{{ repo.summary }}</p>
    </li>
  {% endfor %}
</ul>

Older experiments are on [GitHub](https://github.com/yogendra-j).
