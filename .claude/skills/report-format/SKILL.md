---
name: report-format
description: House style for daily reports produced by the planner and qa-manager so output is consistent and scannable. Invoke when writing a daily plan, a QA report, or any recurring status document.
---

# Report Format (House Style)

Apply to the planner's daily plan and the qa-manager's daily QA report.

## Universal rules
- Start every report with a one-line header: `# <Report Type> — <project> — <YYYY-MM-DD>`.
- Lead with the verdict/bottom line, then the detail. The reader should get the answer in the first 3 lines.
- Use status markers consistently: ✅ done / on-track, ⚠️ at risk, ❌ blocked / failing, ⏳ in progress.
- Every claim is concrete: a number, a file path, or a commit — never "mostly works".
- Keep it to one screen where possible. Link to detail files rather than inlining everything.

## Planner — daily plan layout
```
# Daily Plan — <project> — <date>
**Bottom line:** <one sentence: where we are, biggest risk>

## Progress
- <project>: <% complete> — moved: <what>, blocked: <what>

## Today's Plan
1. [P0] <task> — owner: <agent>
2. [P1] <task> — owner: <agent>

## Push Recommendation
<single highest-leverage focus + why>
```

## QA — daily report layout
```
# QA Report — <project> — <date>
**Verdict:** ship-ready ✅ / not ship-ready ❌ — <one-line reason>

## Tested
| Area | Result | Evidence |
| ---- | ------ | -------- |

## Defects
- [SEV] <title> — <file:line> — repro: <steps>
```

> Tune wording, priority labels (P0/P1 vs High/Med), and section order to your preference.
