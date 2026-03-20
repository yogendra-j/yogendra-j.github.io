---
title: Projects
description: Selected public projects by Yogendra Jaiswal across TypeScript, Go, backend tooling, and deployed applications.
icon: fas fa-diagram-project
order: 1
---

## Selected Projects

{% for repo in site.data.showcase.featured_repositories %}
### [{{ repo.name }}]({{ repo.url }})

**Stack:** {{ repo.language }}  
**Last updated:** {{ repo.updated_at }}

{{ repo.summary }}

{% if repo.live_url %}
[Live demo]({{ repo.live_url }})
{% endif %}

#### What it showcases
{% for item in repo.highlights %}
- {{ item }}
{% endfor %}

{% endfor %}

## More Code

You can find additional experiments, starter projects, and older work on **[GitHub](https://github.com/yogendra-j)**.
