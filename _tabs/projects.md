---
title: Projects
description: Selected public projects by Yogendra Jaiswal across TypeScript, Go, backend tooling, and applied AI engineering work.
icon: fas fa-diagram-project
order: 1
---

<div class="featured-project">
  <p class="fp-label">Featured</p>
  <h3><a href="/projects/agent-orchestrator/">Agent Orchestrator for OpenCode</a></h3>
  <p class="fp-meta">TypeScript &nbsp;·&nbsp; JavaScript &nbsp;·&nbsp; Claude Agent SDK &nbsp;·&nbsp; OpenCode plugin API</p>
  <p class="fp-desc">
    A structured multi-agent system for Claude Code: a CTO agent owning decomposition and review, named engineer agents with durable state, parallel planning with architectural synthesis, and permission boundaries enforced at the tool layer. Designed around the unglamorous parts that make agent systems actually usable — persistent identity, mode enforcement, context pressure tracking, and recovery paths.
  </p>
  <div class="fp-links">
    <a href="/projects/agent-orchestrator/">Case Study →</a>
    <a href="https://github.com/yogendra-j/claude-code-opencode" target="_blank" rel="noopener noreferrer">GitHub →</a>
  </div>
</div>

## Other Projects

My work spans backend APIs, developer tooling, and applied AI. I'm especially interested in systems where LLM-driven workflows still need strong interfaces, guardrails, and reliable engineering underneath.

{% for repo in site.data.showcase.featured_repositories %}
### [{{ repo.name }}]({{ repo.url }})

**Stack:** {{ repo.language }}

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

Additional experiments, starter projects, and older work on **[GitHub](https://github.com/yogendra-j)**.
