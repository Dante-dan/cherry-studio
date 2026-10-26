# Agent Note: 恢复绑定前缀的 Anthropic 思考块回放

Status: implemented

[English](2026-10-26-anthropic-thinking-binding-replay.md) | 中文

## 问题

Claude 5.5 的思考签名将块绑定到请求前缀。编辑历史、更改系统提示或工具、压缩上下文可能让回放的推理失效。Issue #21990 记录了反复发生的 HTTP 400；公开诊断不能确定每次由哪项客户端转换触发。

## 决策

AI SDK 的 Anthropic Messages 请求流程通过 SDK 现有的 `blockBinding` 选项，为带签名的 Claude Opus、Sonnet、Haiku 5.5 历史请求 `thinking.block_binding.prefix_mismatch_behavior: "drop_block"`。SDK 添加 [Anthropic 思考故障排查文档](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting)规定的 beta 请求头。服务端判断哪些块失效；客户端保留提示、有效签名、正文和工具块。

仅自适应思考及其模型默认等价模式获得该选项。显式绑定策略、disabled/between-tools 思考、旧模型、其他协议、原生 Bedrock 和 Azure Anthropic 保持原状。Anthropic 兼容端点路由包括中转服务，但不能据此证明中转服务支持此 beta。Pi 和 Claude Code 运行时请求不在本次范围内。

## 考虑过的替代方案

- 移除全部推理：丢失有效的签名上下文，并可能破坏工具调用回放。
- 在本地重建签名：客户端不能验证或重新生成服务商签名。
- 全局添加 beta：旧模型、不支持的平台和非自适应模式可能拒绝请求。

## 后果

API 可以省略失效的块并继续会话。本次有意接受丢失无效推理，以免话题永久不可用。存储的历史不变。不支持的路由和最近一条助手思考块损坏需要另行调查；不增加通用签名错误重试。

## 验证

- Regression — `node_modules/.bin/vitest run --project main src/main/ai/runtime/aiSdk/params/features/__tests__/anthropicThinkingBinding.test.ts --maxWorkers=1`：Node 24.15.0 下 11 项测试通过。通过已注册的 feature 和真实 SDK 序列化器处理前缀被编辑的带签名历史，断言绑定策略和 beta 请求头，并保留回放内容；同时覆盖显式策略、不兼容模式、不支持的路由及无签名历史。
- Regression — 未复现诊断中的私有载荷，也未验证真实服务商接受请求。请求边界测试证明实际发出的协议字段，不代表付费服务商调用成功。
