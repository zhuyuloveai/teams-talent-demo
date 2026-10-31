---
name: arch-nfr-design
description: "Systematically identifies and designs non-functional requirements (performance/availability/security/scalability/maintainability/compliance), quantifying each metric and its verification method. Use during architecture design, once functional requirements are broadly clear."
---

## 元数据

| 项 | 内容 |
|----|------|
| version | 1.0.0 |
| owner | Arch / 架构委员会 |
| category | 岗位技能 |
| priority | P1 |

# arch-nfr-design 技能

## 概述

本技能用于系统梳理并设计非功能需求，避免"默认满足"式空答。

## 工作流

1. 基于业务场景推导NFR需求
2. 按维度逐项设计应对方案
3. 量化指标（响应时间/吞吐量/可用性SLA/MTTR）
4. 与监管/安全要求对齐
5. 输出NFR设计规格


## 深度档位（L3 实施级）

| 档位 | 要求 |
|------|------|
| L1 | 骨架要点，用于讨论 |
| L2 | 标准评审级（银行生产默认） |
| L3 | 在L2基础上增加以下深度内容（高风险/监管/复杂集成时必用） |

### L3 工作流补充

- L3 NFR逐项给量化指标+设计措施+验证方法+责任人
- 性能项给出容量估算与基准来源

### L3 质量门禁

- [ ] 六大维度全覆盖
- [ ] 每项量化可验证
- [ ] 容量估算有依据

> 主模板含【L3必填】深度字段：`templates/nfr-spec-template.md`；详细档位定义见《Skill深度分级规范》。

## 模板

| 模板 | 用途 |
|------|------|
| `templates/nfr-spec-template.md` | NFR规格模板 |

## 脚本

| 脚本 | 用途 |
|------|------|
| `scripts/nfr_checklist.py` | NFR维度完整性检查 |

## 参考资料

| 资料 | 用途 |
|------|------|
| `references/nfr-dimensions.md` | NFR维度与指标定义 |

## 质量门禁

- [ ] 六大维度全覆盖
- [ ] 指标可测量
- [ ] 与业务目标对齐

## 常见失败模式

| 失败模式 | 规避措施 |
|---------|---------|
| NFR过于笼统 | 强制量化指标 |
| 与业务脱节 | 基于业务场景推导 |