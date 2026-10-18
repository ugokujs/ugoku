---
name: developing-ugoku-features
description: Use when starting new feature work in the ugoku repo, or when asked where design docs, implementation plans, or specs/ files live and whether they're committed.
---

# Developing ugoku Features

## Overview

ugoku features are built through the standard superpowers cycle: brainstorm a design, write an implementation plan, execute it, finish the branch. This skill documents the ugoku-specific conventions around that cycle — where files go, what's committed, what isn't.

## The specs/ directory is local-only

`specs/specs/YYYY-MM-DD-<topic>-design.md` (design docs) and `specs/plans/YYYY-MM-DD-<feature>-plan.md` (implementation plans) still follow the normal superpowers file-location conventions — write to them as usual.

**`specs/` is gitignored.** It is never committed to this repo, on purpose:
- It's useful scratch/reference for whoever is driving the work, but it's internal process detail, not something the published package or its users need.
- Contributors each running their own AI tooling will generate their own spec/plan files under the same path — gitignoring `specs/` means those never collide or get accidentally committed to the shared history.

Don't try to "clean up" this gitignore rule or move specs/ plans into a tracked location — it's intentional.

## Workflow sequence used in this repo

1. `superpowers:brainstorming` → design doc in `specs/specs/`
2. `superpowers:writing-plans` → implementation plan in `specs/plans/`
3. `superpowers:subagent-driven-development` (preferred) or inline execution → implement
4. `superpowers:finishing-a-development-branch` → merge/PR

## Current architecture, scope, and roadmap

Those live in `CLAUDE.md` at the repo root — check it before starting design work to see what's already decided (execution model, fence syntax, package layout, known tradeoffs) and what's still open on the roadmap.
