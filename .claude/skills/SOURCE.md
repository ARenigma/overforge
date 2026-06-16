# Vendored skills — source & attribution

These project-scoped skills and the matching slash commands in `.claude/commands/`
and reference docs in `.claude/references/` are vendored from:

  https://github.com/addyosmani/agent-skills  (see that repo's LICENSE)

Local adaptations for project scope:
- `.claude/commands/*.md`: stripped the `agent-skills:` plugin namespace so the
  commands invoke the project-scoped skills by their bare names.
- `SKILL.md` files: repointed `references/*.md` citations to `../../references/*.md`.

To update: re-clone the upstream repo and re-apply these two adaptations, or switch
to the upstream Claude Code plugin (`/plugin marketplace add addyosmani/agent-skills`).
