# Manual Or Staging Stage Runbook

## Purpose

Provide optional later-stage validation using previously accepted candidates.

## Current State

This stage is not active in workflows yet.

## Activation Criteria

1. Deployment uses the same candidate manifest and digest refs.
2. No rebuild or artifact substitution is allowed.
3. Evidence and approval model is defined and auditable.
