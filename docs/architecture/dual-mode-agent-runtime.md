# Dual-Mode Agent Runtime Baseline

Purpose: explain the two execution modes and their shared thread/event model.

## Core Idea

- one thread model
- two execution modes: `cloud` and `local`
- one persisted event timeline across modes

## Flow

- cloud mode: API brokers turns to dynamic sessions runtime
- local mode: desktop runtime executes locally and uplinks events
- mode switching is allowed only when no turn is in progress

## Security Rules

- browser clients never receive management tokens
- local credentials stay in desktop secure storage
- workspace authorization bounds all reads/writes

## Source

- API routes and runtime manager implementations
- migration and contract artifacts for `agent_*` tables and events
