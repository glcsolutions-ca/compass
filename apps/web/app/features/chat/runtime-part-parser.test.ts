import { describe, expect, it } from "vitest";
import {
  eventRendersInline,
  mergeTimelineMessageParts,
  parseItemDeltaParts,
  parseRuntimeDataPart,
  readTimelineMessageText
} from "~/features/chat/runtime-part-parser";

describe("runtime-part-parser", () => {
  it("parses text and reasoning content segments", () => {
    const parts = parseItemDeltaParts({
      cursor: 9,
      payload: {
        content: [
          { type: "reasoning", text: "Thinking" },
          { type: "text", text: "Answer" }
        ]
      }
    });

    expect(parts).toEqual([
      { type: "reasoning", text: "Thinking" },
      { type: "text", text: "Answer", parentId: undefined }
    ]);
  });

  it("parses tool call content and infers args/result", () => {
    const parts = parseItemDeltaParts({
      cursor: 2,
      payload: {
        content: [
          {
            type: "tool_call",
            function: {
              name: "read_file",
              arguments: '{"path":"README.md"}'
            },
            result: { ok: true }
          }
        ]
      }
    });

    expect(parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "tool-2-0",
        toolName: "read_file",
        argsText: '{"path":"README.md"}',
        args: { path: "README.md" },
        result: { ok: true },
        isError: false,
        parentId: undefined
      }
    ]);
  });

  it("falls back to top-level reasoning and text when content array is absent", () => {
    const parts = parseItemDeltaParts({
      cursor: 3,
      payload: {
        type: "reasoning",
        text: "Consider options",
        delta: "ignored when reasoning text exists"
      }
    });

    expect(parts).toEqual([{ type: "reasoning", text: "Consider options" }]);
  });

  it("returns empty parts for unsupported payloads", () => {
    expect(parseItemDeltaParts({ cursor: 1, payload: null })).toEqual([]);
    expect(parseItemDeltaParts({ cursor: 1, payload: { unknown: true } })).toEqual([]);
  });

  it("merges consecutive text/reasoning parts and upserts tool-call parts by id", () => {
    const merged = mergeTimelineMessageParts(
      [
        { type: "text", text: "Hi" },
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "read_file",
          argsText: '{"path":"README"}',
          args: { path: "README" },
          result: null,
          isError: false
        }
      ],
      [
        { type: "text", text: " there" },
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "read_file",
          argsText: '{"path":"README.md"}',
          args: { path: "README.md" },
          result: { lines: 12 },
          isError: false
        },
        { type: "reasoning", text: "Because." }
      ]
    );

    expect(merged).toEqual([
      { type: "text", text: "Hi" },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "read_file",
        argsText: '{"path":"README"}{"path":"README.md"}',
        args: { path: "README.md" },
        result: { lines: 12 },
        isError: false
      },
      { type: "text", text: " there" },
      { type: "reasoning", text: "Because." }
    ]);
  });

  it("reads message text from text/reasoning parts only", () => {
    expect(
      readTimelineMessageText([
        { type: "text", text: "Answer" },
        { type: "data", name: "runtime.metadata", data: { source: "x" } },
        { type: "reasoning", text: " rationale" }
      ])
    ).toBe("Answer rationale");
  });

  it("parses runtime metadata events and inline rendering checks", () => {
    expect(
      parseRuntimeDataPart({
        method: "runtime.metadata",
        payload: { foo: "bar" }
      })
    ).toEqual({
      type: "data",
      name: "runtime.metadata",
      data: { foo: "bar" }
    });

    expect(
      parseRuntimeDataPart({
        method: "turn.started",
        payload: {}
      })
    ).toBeNull();

    expect(
      eventRendersInline({
        cursor: 1,
        method: "runtime.custom",
        payload: { ok: true }
      })
    ).toBe(true);
    expect(
      eventRendersInline({
        cursor: 1,
        method: "item.delta",
        payload: { text: "streaming" }
      })
    ).toBe(true);
    expect(
      eventRendersInline({
        cursor: 1,
        method: "item.delta",
        payload: { unsupported: true }
      })
    ).toBe(false);
    expect(
      eventRendersInline({
        cursor: 1,
        method: "turn.completed",
        payload: {}
      })
    ).toBe(false);
  });
});
