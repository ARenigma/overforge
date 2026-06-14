## Summary

<!-- One-paragraph description of what this PR does and why -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (fix or feature that would change existing behaviour)
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] CI / tooling
- [ ] Dependency bump

## How was this tested?

- [ ] Local `npm test` in `backend/`
- [ ] Local `npm run lint` in both `backend/` and `frontend/`
- [ ] Local `npm run build` in `frontend/`
- [ ] Local `pre-push` hook ran clean
- [ ] Manual end-to-end test (describe below)

If you changed the AI module:

- [ ] `python -m compileall ai_module` clean
- [ ] `ruff check ai_module` clean
- [ ] `ruff format --check ai_module` clean

## Checklist

- [ ] I read the relevant files before changing them
- [ ] My change does not introduce secrets, debug logs, or large debug files
- [ ] I added/updated tests for any new behaviour
- [ ] All new and existing tests pass locally
- [ ] I considered the LHIS / assessment flow if I touched `backend/src/services/` or `sockets/`

## Related issues / context

<!-- Link any GitHub issues, e.g. "Closes #12" -->
