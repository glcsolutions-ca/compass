# TDR-007: Compass Chat Dictation UX (Deferred)

## Status

Proposed

## Date

2026-02-27

## Context

Compass Chat users need a fast, hands-free way to draft prompts without switching contexts or losing flow.
Dictation in chat should feel immediate and low-friction, matching familiar terminal-like interactions and codex-style quality-of-life.

At this stage, chat persistence has not been fully standardized across DB and UI, so durable and coherent dictation continuity is not yet safe to implement in production.

## Decision

Document this requirement as a first-class user story and UX contract for Compass Chat dictation, including explicit start, stop, waveform feedback, and send/hold options.

This feature is **deferred** until chat persistence is available at both DB and UI layers, so no API, storage, or retrieval implementation decisions are made here.

## User story

As a Compass Chat user, I want to dictate a message directly in the chat composer, review/edit the transcript when needed, and choose whether to send immediately or send later.

## User-visible behavior

- The chat composer displays a dictation control (microphone button) when idle.
- Pressing the dictation control starts audio capture and transitions the composer into dictation mode.
- While dictation is active, a stop control is displayed and clearly indicates recording status.
- During active dictation, a waveform/audio signal is shown in or beneath the chat bar to confirm live audio capture.
- After stopping dictation, the transcribed text is inserted into the composer as editable draft text.
- Two post-capture flows are available:
  - Stop-first flow: stop dictation, review/edit transcript in composer, and send manually.
  - Transcribe-and-send flow: capture and transcribe, then send immediately in one action.
- Stopping dictation does not automatically send a message unless the user explicitly chooses transcribe-and-send.
- If transcription or send fails, the drafted text remains available and retry flow is available.
- Long sessions (for example, multi-minute dictation) continue to render state predictably without losing the draft.
- If dictation is not possible (permissions or unavailable feature), normal manual typing remains available and usable.

This is a polished, low-friction dictation experience: one control to start, one control to stop, and one optional explicit send action.

## Out of scope

- Storage schema, DB tables, API contracts, endpoint design, and specific retrieval mechanisms.
- Choice of ASR engine, streaming protocol, or transcription vendor in this ADR.
- Cross-device synchronization behavior and conflict resolution.
- Offline-first architecture, background upload strategies, and queue semantics (deferred).

## Rollout prerequisite

Implement only after chat persistence is available at both DB and UI layers so dictation drafts are durable across sessions and state transitions.

## References

- OpenAI, [Voice dictation FAQ](https://help.openai.com/es-es/articles/12168547-voice-dictation-faq).
- OpenAI Academy, [Using voice](https://academy.openai.com/public/clubs/work-users-ynjqu/resources/using-voice).
- OpenAI Help Center, [How to use voice for conversation in ChatGPT](https://help.openai.com/en/articles/11487532).
- Assistant UI, [Dictation guide](https://www.assistant-ui.com/docs/guides/dictation).
- MDN, [SpeechRecognition - Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- MDN, [MediaStream Recording API (MediaRecorder)](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).
- react-voice-visualizer, component with waveform and playback support: https://github.com/YZarytskyi/react-voice-visualizer
- react-voice-recorder-player, recorder+waveform component: https://github.com/AbreezaSaleem/react-voice-recorder-player
