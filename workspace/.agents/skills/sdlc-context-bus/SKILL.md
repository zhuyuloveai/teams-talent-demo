---
name: sdlc-context-bus
description: "SDLC context bus and Agent collaboration mechanism, providing structured context passing, callback-based fixes, parallel orchestration and conditional branching."
---

## 元数据

| 项 | 内容 |
|----|------|
| version | 1.0.0 |
| owner | 平台架构组 |
| category | 平台P0 |
| priority | P0 |
| depth | L2 |

# SDLC 上下文总线与 Agent 协作机制

## 角色定义

SDLC Agent 协作中枢，由 orchestrator 调用，提供：
1. **上下文总线**：结构化 JSON 替代文件路径传递，Agent 产出后自动写入，下一环节自动读取
2. **回调机制**：G4 测试发现缺陷时回调 developer 修复，修复后自动恢复流程
3. **并行编排**：G3 开发与 G4 测试设计并行，G6 发布准备与 G7 变更申请并行
4. **条件分支**：G5 安全扫描发现高危时自动分支到 developer 修复，低危时继续推进

**上游 Agent**：所有 G 阶段 Agent（产出写入总线）
**执行 Agent**：orchestrator（编排决策）
**调用时机**：每次 Agent 产出后、门禁执行前

## 上下文总线数据结构

```json
{
  "project": {
    "name": "EPS-demo-project",
    "requirement_id": "REQ-2026-0003",
    "requirement_title": "日累计限额参数化与超额预警"
  },
  "phases": {
    "G1": {
      "agent": "requirement-analyst",
      "status": "completed",
      "started_at": "2026-08-11T10:00:00Z",
      "completed_at": "2026-08-11T10:30:00Z",
      "outputs": [
        ".sdlc-demo/01-requirement/需求说明书.md",
        ".sdlc-demo/01-requirement/用户故事与验收标准.md"
      ],
      "gate_result": "pass",
      "gate_details": {"spec_completeness": 92, "ambiguity_high": 2, "rtm_coverage": "100%"},
      "context": {
        "requirement_summary": "日累计限额参数化+80%预警阈值+接口扩展+前端提示",
        "key_decisions": ["预警非阻断", "阈值参数化", "审计日志"],
        "constraints": ["不改变现有限额值", "兼容V3迁移"]
      }
    }
  },
  "callbacks": [],
  "parallel_groups": [],
  "branches": []
}
```

## 档位切换规则

| 档位 | 触发条件 | 附加动作 |
|------|---------|---------|
| L1 | 常规串行流程 | 基础上下文传递（文件路径+状态） |
| L2 | 并行编排或回调场景 | 增加并行组管理+回调队列+冲突检测 |
| L3 | 复杂多分支场景 | 增加条件分支图+拓扑排序+死锁检测 |

## 深度档位（L3 实施级）

### 1. 上下文写入（Agent 产出后）
- 解析 Agent 产出文件，提取关键信息
- 更新 context-bus.json 中对应阶段的状态和 context
- 记录时间戳和产出文件列表

### 2. 回调机制（缺陷修复闭环）
- G4 发现缺陷 → 写入 callbacks 队列
- 通知 developer Agent 修复
- 修复完成 → 自动恢复 G4 流程
- 回调次数 > 3 时升级到人工处理

### 3. 并行编排
- 识别可并行的阶段组（G3+G4设计、G6+G7）
- 创建 parallel_groups，记录并行阶段和同步点
- 并行阶段全部完成后才进入下一阶段

### 4. 条件分支
- 门禁结果分析：fail→分支到修复Agent，pass→继续
- 分支决策写入 branches 数组
- 记录分支条件和恢复路径

## 质量门禁

| 门禁 | 阈值 | 校验方式 |
|------|------|---------|
| 上下文传递完整性 | 100% | context_bus_validate.py |
| 回调闭环率 | 100% | callback_check.py |
| 并行无冲突 | 0冲突 | parallel_check.py |
| 分支决策可追溯 | 100% | branch_trace.py |

## 失败模式

| 失败模式 | 表现 | 规避措施 | 重试策略 |
|---------|------|---------|---------|
| 上下文丢失 | 下一环节找不到产出 | 写入后立即校验文件存在性 | 重新写入+校验 |
| 回调死循环 | 修复→测试→再修复循环 | 限制回调次数≤3 | 超限升级人工 |
| 并行冲突 | 两个Agent修改同一文件 | 文件级锁+冲突检测 | 串行化重试 |
| 分支遗漏 | 条件分支未恢复 | 分支状态机+定时检查 | 超时告警+人工介入 |

## 升级路径

| 升级 | L1→L2 增量字段 | L2→L3 增量字段 | 回退条件 |
|------|---------------|---------------|---------|
| 上下文 | +parallel_groups +callbacks | +branch_graph +topology | 无并行需求时退回L1 |
| 校验 | +冲突检测 | +死锁检测+环检测 | 无分支场景退回L2 |
