---
title: Projects
description: Case studies by Yogendra Jaiswal on an enterprise AI workflow platform, an OpenCode agent orchestrator, and benchmarking coding agents on real pull requests.
icon: fas fa-diagram-project
order: 1
---

{% include work-cards.html metadata=true %}

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
