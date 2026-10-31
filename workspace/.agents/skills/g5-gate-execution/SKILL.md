---
name: g5-gate-execution
description: "G5 security-phase gate runner. Runs the vulnerability triage check and summarizes the results."
---

## 元数据

| 项 | 内容 |
|----|------|
| version | 1.0.0 |
| owner | PM条线 |
| category | 合规P0 |
| priority | P0 |
| depth | L2 |

# G5 安全阶段门禁执行器

## 角色定义

G5阶段门禁执行器，由 A-08-PM 调用，统一运行该阶段所有校验脚本并汇总结果。

**上游 Agent**：A-05-Sec（产出安全阶段交付物）
**执行 Agent**：A-08-PM（门禁执行与汇总）
**调用时机**：A-05-Sec 完成安全阶段产出后，PM 执行本 Skill 进行门禁校验

## 脚本清单

  - triage_vulns（sec-scan-review/scripts/triage_vulns.py）：漏洞分诊

## 档位切换规则

| 档位 | 触发条件 | 附加动作 |
|------|---------|---------|
| L1 | 日常变更 | 运行全部校验脚本，输出 pass/fail |
| L2 | 常规变更 | L1 + 输出 JSON 详情（每脚本退出码+stdout摘要） |
| L3 | 高风险/监管变更 | L2 + 逐项阈值分析 + 建议处置 + 失败脚本重试建议 |

## 深度档位（L3 实施级）

### 步骤0：预检产出文件
- 检查产出目录是否存在
- 检查每个脚本的输入文件是否存在
- 缺失文件时输出告警并标记该脚本为 skipped

### 步骤1：运行 triage_vulns
- 脚本路径：`sec-scan-review/scripts/triage_vulns.py`
- 检查内容：漏洞分诊
- 通过标准：0未解决高危
- 退出码：0=通过，1=失败

### 步骤2：汇总结果
- 收集所有脚本的退出码和 stdout
- 生成 `G5_gate_result.json`
- 输出控制台摘要：pass=N / fail=N / skip=N
- 总退出码：全通过=0，存在失败=1，存在跳过=2

### 步骤3：门禁决策
- 全部通过 → 门禁 PASS，可进入下一阶段
- 存在失败 → 门禁 FAIL，退回上游 Agent 修复
- 存在跳过 → 门禁 WARN，人工评估是否继续

## 质量门禁

| 检查项 | 阈值 | 校验脚本 |
|--------|------|---------|
| 漏洞分诊 | 0未解决高危 | triage_vulns.py |

## 失败模式

| 失败模式 | 表现 | 规避措施 | 重试策略 |
|---------|------|---------|---------|
| 产出文件缺失 | FileNotFoundError | 预检文件存在性，缺失时标记 skipped | 补全文件后重试 |
| 脚本路径错误 | ModuleNotFoundError/FileNotFoundError | 使用 --skills-dir 参数指定 skills 基目录 | 修正路径后重试 |
| 脚本超时 | subprocess timeout（默认30秒） | 设置超时并杀进程 | 检查脚本死锁后重试 |
| JSON 解析失败 | json.JSONDecodeError | 捕获异常，使用 stdout 作为 fallback | 手动检查脚本输出 |
| 部分脚本失败 | exit_code != 0 | 不中断后续脚本，继续执行 | 修复失败项后重跑 |

## 升级路径

| 升级 | 增量字段/动作 | 回退条件 |
|------|-------------|---------|
| L1→L2 | JSON 详情输出（每脚本退出码+stdout摘要） | 无需回退，L2 为默认 |
| L2→L3 | 逐项阈值分析 + 处置建议 + 重试建议 | 风险降级时回退到 L2 |

## scripts/README.md

本目录包含 1 个脚本：
- `run_g5_gate.py`：G5 门禁执行器，统一调用该阶段所有校验脚本并汇总结果

### 使用方法

```bash
# 基本用法（默认 skills 目录为 ../../ ）
python run_g5_gate.py .sdlc-demo/05-security/

# 指定 skills 基目录
python run_g5_gate.py .sdlc-demo/05-security/ --skills-dir /path/to/skills/

# L3 模式（含逐项阈值分析）
python run_g5_gate.py .sdlc-demo/05-security/ --depth L3
```

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 全部通过 |
| 1 | 存在失败 |
| 2 | 存在跳过（人工评估） |
