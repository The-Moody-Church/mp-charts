# Pre-PR Security Review Checklist

**MANDATORY**: Before creating any PR, perform a security review of all changed files in the branch. This replaces an automated CI check — it must happen during development.

**Steps:**
1. Run `git diff main...HEAD --name-only` to list all changed files
2. For each changed file, review against the checklist below
3. Include a "Security Review" section in the PR description summarizing what was checked and any findings

**Checklist — check every changed file for:**

**Critical (must fix before PR):**
- [ ] Filter injection: Any string interpolated into a `filter:` parameter without `sanitizeFilterValue()`, `sanitizeIds()`, or `sanitizeGuid()` from `@/lib/providers/ministry-platform/utils/filter-sanitize`
- [ ] Open redirects: User-supplied URLs used for redirects without validation
- [ ] Missing authentication: Server actions without `requireSession()` call before data access
- [ ] Hardcoded secrets or credentials
- [ ] Internal infrastructure details: IP addresses, hostnames, SSH usernames, internal file paths, or deployment details that would expose network topology in a public repo

**High (must fix before PR):**
- [ ] PII logged via `console.log` — contact records, emails, phones, notes, request/response bodies
- [ ] File uploads without MIME type validation (`ALLOWED_IMAGE_TYPES` / `ALLOWED_DOCUMENT_TYPES`)
- [ ] Missing input validation on user-supplied IDs (NaN, type coercion, negative numbers)

**Medium (flag in PR description):**
- [ ] New endpoints accepting record IDs without per-record authorization (IDOR risk)
- [ ] Verbose logging not gated behind `NODE_ENV === 'development'`
- [ ] New dependencies added (check `npm audit` output)

**PR description format:**
```markdown
## Security Review
- **Files reviewed**: N files
- **Issues found**: None | N issues (list them)
- **Checklist**: All critical/high items pass
- **Notes**: (any medium-severity items or architectural observations)
```

Refer to `.claude/notes/security-audit-2026-02-24.md` for the full audit report and the "Security Best Practices" section in CLAUDE.md for detailed rules and code examples.
