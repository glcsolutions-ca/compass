# Testkit

Shared test helpers for Compass apps and packages.

## Included helpers

- `fixedClock(isoTimestamp)` - deterministic clock helper for time-sensitive tests
- `createFactory(base)` - small fixture factory helper with override support
- `withEnv(patch, run)` - scoped environment patching that always restores previous values
- `createFetchJsonFixture(fixtures, fallback)` - deterministic JSON fetch fixture with call capture
- `createEventEnvelopeFixture(overrides)` - baseline worker event envelope fixture
- `createServiceBusMessageFixture(overrides)` - baseline Service Bus message fixture for worker tests
