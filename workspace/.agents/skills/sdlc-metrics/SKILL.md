---
name: sdlc-metrics
description: "SDLC delivery performance metrics system. Collects Lead Time/gate interception rate/DORA metrics/Agent effectiveness and generates metrics dashboards and trend reports."
---

## 元数据

| 项 | 内容 |
|----|------|
| version | 1.0.0 |
| owner | PM条线 |
| category | 平台P0 |
| priority | P1 |
| depth | L2 |

# SDLC 交付效能度量体系

## 角色定义

SDLC 交付效能度量工具，由 project-manager 调用，提供：
1. **Lead Time 度量**：需求→上线的全周期时间，G1-G8各阶段耗时
2. **门禁拦截率**：各门禁的退回率、退回原因分布
3. **DORA 指标**：部署频率、变更失败率、MTTR、缺陷逃逸率
4. **Agent 效能**：脚本通过率、人工干预次数、返工率

**上游 Agent**：所有 G 阶段 Agent（产出时间戳和结果）
**执行 Agent**：project-manager（度量采集与报告）
**调用时机**：每个门禁执行后自动采集，G8完成后生成总结报告

## 度量指标定义

### Lead Time
| 指标 | 定义 | 计算方式 | 目标 |
|------|------|---------|------|
| 需求→上线 | 从G1开始到G8完成的总时间 | completed_at(G8) - started_at(G1) | ≤ 15天 |
| G1-G8耗时 | 各阶段耗时分布 | 各阶段 completed_at - started_at | ≤ 8小时(Agent) |
| 门禁等待 | 门禁执行到审批通过的时间 | approved_at - gate_executed_at | ≤ 4小时 |

### 门禁拦截率
| 指标 | 定义 | 目标 |
|------|------|------|
| G1退回率 | 需求被退回的比例 | 越早发现越好 |
| G3退回率 | 代码被退回的比例 | ≤ 15% |
| G5退回率 | 安全被退回的比例 | ≤ 10% |
| 退回原因Top3 | 最常见的退回原因 | 用于改进 |

### DORA 指标
| 指标 | 定义 | 目标 |
|------|------|------|
| 部署频率 | 每周成功部署次数 | ≥ 2次/周 |
| 变更失败率 | 导致回滚或故障的变更比例 | ≤ 10% |
| MTTR | 从故障到恢复的平均时间 | ≤ 2小时 |
| 缺陷逃逸率 | 生产发现的缺陷/总缺陷 | ≤ 5% |

### Agent 效能
| 指标 | 定义 | 目标 |
|------|------|------|
| 脚本通过率 | 一次性通过的脚本比例 | ≥ 95% |
| 人工干预次数 | 每阶段平均人工干预次数 | ≤ 3次 |
| 返工率 | 需要返工的阶段比例 | ≤ 10% |
| Agent自主率 | Agent无需人工干预完成的比例 | ≥ 80% |

## 档位切换规则

| 档位 | 触发条件 | 附加动作 |
|------|---------|---------|
| L1 | 单次度量 | 采集基础指标+控制台输出 |
| L2 | 趋势分析 | 增加历史对比+趋势图+偏差告警 |
| L3 | 管理层看板 | 增加多项目对比+根因分析+改进建议 |

## 深度档位（L3 实施级）

L3 实施级在 L2 基础上增加以下深度要求（高风险/监管/管理层看板场景）：

### L3 工作流补充

- 多项目横向对比：采集多项目度量数据，生成对比看板与排名
- 趋势根因分析：对偏差指标（Lead Time 超标、缺陷逃逸率超标）做根因定位
- 改进建议生成：基于趋势与根因输出可落地的改进建议清单

### L3 质量门禁

- [ ] 度量采集覆盖率 100%（8 阶段时间戳齐全）
- [ ] DORA 四指标全部可量化（部署频率/变更失败率/MTTR/缺陷逃逸率）
- [ ] 时间戳完整性 8/8 阶段

## 质量门禁

| 门禁 | 阈值 | 校验方式 |
|------|------|---------|
| 度量采集覆盖率 | 100% | metrics_validate.py |
| DORA指标完整 | 4/4 | metrics_validate.py |
| 时间戳完整 | 8/8阶段 | metrics_validate.py |

## 失败模式

| 失败模式 | 表现 | 规避措施 | 重试策略 |
|---------|------|---------|---------|
| 时间戳缺失 | 无法计算耗时 | 强制写入时间戳 | 用文件修改时间兜底 |
| 指标异常 | 数值超出合理范围 | 合理性校验+告警 | 标记异常+人工确认 |
| 历史数据不足 | 无法做趋势分析 | 至少3次交付后启用趋势 | 首次只出单次报告 |

## 升级路径

| 升级 | L1→L2增量 | L2→L3增量 | 回退条件 |
|------|----------|----------|---------|
| 指标 | +趋势+偏差 | +多项目对比 | 数据不足退回L1 |
| 报告 | +趋势图 | +根因+改进建议 | 无管理层需求退回L2 |

## 脚本清单

| 脚本 | 用途 | 退出码 |
|------|------|--------|
| `collect_metrics.py` | 从 context-bus.json 和门禁结果采集度量数据，计算全部指标 | 0=成功, 1=数据不完整 |
| `generate_dashboard.py` | 读取 metrics-report.json 生成 Markdown 可视化看板 | 0=成功, 1=失败 |
| `validate_metrics.py` | 校验度量数据完整性（时间戳/DORA/合理性） | 0=完整, 1=缺失 |

## 调用方式

```bash
# 1. 采集度量数据（每个门禁执行后或G8完成后调用）
python scripts/collect_metrics.py \
    --context .sdlc-demo/context-bus.json \
    --output .sdlc-demo/08-pm/metrics-report.json

# 2. 校验度量数据完整性（采集后必跑）
python scripts/validate_metrics.py \
    --metrics .sdlc-demo/08-pm/metrics-report.json

# 3. 生成可视化看板
python scripts/generate_dashboard.py \
    --metrics .sdlc-demo/08-pm/metrics-report.json \
    --output .sdlc-demo/08-pm/dashboard.md \
    [--trend .sdlc-demo/08-pm/history.json]
```

## 归属 Agent

- project-manager（主用，度量采集与报告生成）
- orchestrator（全局视图，调用看板生成）
