# TDR-006: Compass Chat Prompt History Keyboard Navigation (Deferred)

## Status

Proposed

## Date

2026-02-27

## Context

Compass Chat users rely on fast, keyboard-driven workflows for sending and refining prompts.
A terminal-like prompt history experience is a quality-of-life improvement that helps users quickly edit and retry recent prompts without touching the mouse.

At this stage, Chat message persistence is not yet in place, so a durable history flow should be planned intentionally rather than implemented piecemeal.

## Decision

Document this requirement as a first-class user story for a later implementation after chat persistence is established.

This feature is **deferred** until chat persistence is available at both the DB and UI layers, so no API, schema, or storage implementation details are decided here.

## User story

As a Compass Chat user, when I open the empty chat input and press the up/down keys, I want the input to recall my previously sent prompts so I can quickly edit and resend them.

## User-visible behavior

- When chat input is empty and I press `ArrowUp`, the most recently sent prompt appears in the composer.
- Repeated `ArrowUp` presses continue to walk backward through prior prompts, from newest to oldest.
- When I press `ArrowDown`, it walks forward through history toward newer prompts.
- After the most recent-history entry, `ArrowDown` returns me to the current unsent draft exactly as I left it.
- If there is no history, up/down keys do nothing and I can continue typing normally.
- Up/down navigation should not submit messages automatically and should not introduce extra controls.
- At the beginning or end of history, pressing further up/down keys should not error and should keep me at the boundary state.

This is a terminal-like quality-of-life feature and should feel immediate, predictable, and low-friction:
single key strokes, no extra clicks, and no visual mode switch needed.

## Out of scope

- Backend API changes and storage retrieval strategies.
- Local-only caching and cross-device synchronization mechanisms.
- Prefix-based history search behavior.
- Any implementation-specific persistence model.

## Rollout prerequisite

Implement only after chat persistence is available at both the DB and UI layers so that history replay is durable and coherent across sessions.
