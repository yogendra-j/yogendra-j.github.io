---
title: Skills
description: Technical skills and interview-ready areas of expertise for Yogendra Jaiswal.
icon: fas fa-screwdriver-wrench
order: 2
---

## Technical Skills

{% for group in site.data.showcase.skill_groups %}
### {{ group.title }}

{% for item in group.items %}
- {{ item }}
{% endfor %}

{% endfor %}

## Interview Topics I Can Discuss Well

{% for topic in site.data.showcase.interview_topics %}
- {{ topic }}
{% endfor %}

## Writing as Proof of Skill

The posts on this site are intentionally practical. They are meant to show how I reason about tradeoffs, not just list technologies I have touched.
