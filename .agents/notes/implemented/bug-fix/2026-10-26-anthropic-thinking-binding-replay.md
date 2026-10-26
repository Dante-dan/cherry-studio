# Agent Note: Recovering prefix-bound Anthropic thinking replay

Status: implemented

English | [中文](2026-10-26-anthropic-thinking-binding-replay.zh.md)

## Problem

Claude 5.5 thinking signatures bind blocks to the request prefix. Editing history, changing system/tools, or compaction can invalidate replayed reasoning. Issue #21990 records repeated HTTP 400 failures; the public diagnostics do not establish which client transformation caused each occurrence.

## Decision

The AI SDK Anthropic Messages request pipeline opts signed Claude Opus, Sonnet, and Haiku 5.5 history into `thinking.block_binding.prefix_mismatch_behavior: "drop_block"` through the SDK's existing `blockBinding` option. The SDK adds the required beta header described in the [Anthropic thinking troubleshooting reference](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting). The server decides which blocks are invalid; the client preserves the prompt, valid signatures, text, and tool blocks.

Only adaptive thinking or its model-default equivalent receives the option. Explicit binding policies, disabled/between-tools thinking, older models, other protocols, native Bedrock, and Azure Anthropic are left alone. The Anthropic-compatible endpoint route includes relays; it does not prove a relay implements the beta. Pi and Claude Code runtime requests are outside this change.

## Alternatives considered

- Strip all reasoning: loses valid signed context and can break tool-use replay.
- Reconstruct signatures locally: the client cannot validate or regenerate provider signatures.
- Add the beta globally: older models, unsupported platforms, and non-adaptive modes may reject it.

## Consequences

An invalidated block can be omitted by the API while the conversation continues. This intentionally accepts losing invalid reasoning instead of making a topic permanently unusable. Stored history is untouched. Unsupported routes and corruption of the latest assistant thinking block need separate investigation; no general signature-error retry is added.

## Verification

- Regression — `node_modules/.bin/vitest run --project main src/main/ai/runtime/aiSdk/params/features/__tests__/anthropicThinkingBinding.test.ts --maxWorkers=1`: 11 tests pass on Node 24.15.0. It exercises signed history after prefix edits through the registered feature and real SDK serializer, asserting the binding policy and beta header while preserving replayed content; also covers explicit policy, incompatible modes, unsupported routes, and unsigned history.
- Regression — The diagnostics' private payloads and live provider acceptance were not reproduced. The request-boundary tests establish emitted wire behavior, not a successful paid provider call.
