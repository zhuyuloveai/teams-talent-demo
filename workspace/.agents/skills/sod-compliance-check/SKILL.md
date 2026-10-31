---
name: sod-compliance-check
description: "Automatically detects segregation of duties (SoD) conflicts: role permission conflicts, gate executor vs. approver conflicts, and indirect conflicts (transitive closure). Use for gate reviews, configuration changes and audit sampling."
---

## 元数据

| 项 | 内容 |
|----|------|
| version | 1.0.0 |
| owner | 全员 / 合规与审计 |
| category | 合规技能 |
| priority | P0 |
| depth | L2 |

# sod-compliance-check 技能

## 概述

本技能用于自动检测职责分离（Segregation of Duties, SoD）冲突，确保银行全流程中"执行、审批、复核、审计"四类职责相互独立，避免单一角色或个人同时掌握互斥权限引发的资金风险、舞弊风险与合规违规。

**核心价值：**
- **职责分离强约束**：以权限对互斥矩阵为依据，强制执行/审批/复核/审计四眼原则，杜绝"自己审自己""自己批自己"
- **冲突自动检测**：`sod_check.py` 对角色权限配置做确定性扫描，命中即阻断，避免人工漏检
- **间接冲突传递闭包**（L3）：通过权限依赖与用户-角色绑定关系计算传递闭包，发现"单角色合规但组合违规"的隐蔽冲突（如用户A同时持有 Dev + Approver 两个角色）
- **处置建议可操作**：每条冲突告警附风险等级、合规依据与处置动作（分离/转授/补偿控制），可直接驱动整改

## 工作流

### Step 1: 加载角色权限配置与冲突矩阵

读取待检配置与参考资料：

| 资料 | 内容 | 何时加载 |
|------|------|---------|
| 角色权限配置（JSON） | `roles: {role: [permissions]}`，可选 `user_roles: {user: [roles]}`、`gates: {gate: {executor, approver}}` | 任何 SoD 检查 |
| `references/sod-matrix.md` | SoD 冲突矩阵（权限对、冲突类型、风险等级、合规依据、处置建议） | 任何 SoD 检查 |
| `references/sod-policy.md` | SoD 合规策略（职责分离原则、角色定义、权限分配规则、冲突处置流程） | 制度对齐/首次检查 |
| `templates/sod-compliance-report.md` | SoD 合规报告模板 | 生成报告时 |

核对配置完整性：
- [ ] 角色定义是否使用标准角色目录（见 `references/sod-policy.md`），无自定义别名
- [ ] 每个角色的权限列表是否为标准权限名（编码/代码评审/批准MR/测试/缺陷修复/变更申请/生产发布/参数配置/参数审批/安全放行/漏洞修复/审计读取/数据导出 等）
- [ ] 冲突矩阵是否覆盖当前场景（开发、运维、参数、审计四类）
- [ ] L3 场景：用户-角色绑定关系是否齐全

### Step 2: 直接冲突检测

对每个角色，检查其权限集是否同时包含冲突矩阵中的互斥权限对：

```
for role in roles:
    permset = roles[role]
    for (permA, permB) in conflicts:
        if permA in permset and permB in permset:
            记录直接冲突: {role, pair:[permA, permB], type:"直接", severity:"高"}
```

运行 `scripts/sod_check.py <config.json> --json` 完成本步（脚本仅做单角色直接冲突检测）。

### Step 3: 门禁执行人/审批人冲突检测

若配置含 `gates` 字段，逐门禁检查：
- [ ] 执行人角色 ≠ 审批人角色（四眼原则）
- [ ] 执行人与审批人不是同一用户（L3 需 user_roles 展开）
- [ ] 执行人无"审批"类权限，审批人无"执行"类权限

冲突示例：G2 评审门禁 executor=Dev、approver=Dev → 命中"编码+评审"直接冲突，且违反四眼原则。

### Step 4: 间接冲突检测（传递闭包，L3）

> 当前 `sod_check.py` 仅支持单角色直接冲突检测；间接冲突（传递闭包）为 L3 能力，需通过权限闭包算法人工/扩展工具计算，结果填入报告。

**传递闭包算法：**

1. **权限依赖闭包**：构建权限依赖图 D（permX→permY 表示持有 X 隐含/需要 Y），对每个角色的权限集求依赖闭包 `closure(role_perms)`，再用扩展后的权限集与冲突矩阵比对
2. **用户-角色累积闭包**：对每个用户，合并其所有角色的权限集 `user_perms = ∪ role_perms`，检查累积集是否命中冲突对
3. **冲突关系传递闭包**：构建冲突图 G（权限为节点，冲突对为边），用 Floyd-Warshall/BFS 求传递闭包；若 permA 经路径 permA→permC→permB 间接关联，且角色同时持有 permA 与 permB，则记为间接冲突

**间接冲突路径展示**（示例）：
```
用户 U001 持有角色 [Dev, Approver]
  Dev → [编码, 单元测试]
  Approver → [批准MR, 代码评审]
  累积权限: [编码, 单元测试, 批准MR, 代码评审]
  命中冲突对: (编码, 代码评审) → 间接冲突
  路径: U001 → Dev → 编码 ──冲突── 代码评审 ← Approver ← U001
```

### Step 5: 告警与处置建议生成

对每条冲突，从 `references/sod-matrix.md` 查表生成处置建议：

| 严重度 | 处置动作 | 时效 |
|--------|---------|------|
| 高（资金/监管/生产） | 立即分离权限，阻断流程 | 即时 |
| 中（流程绕过风险） | 限期转授或增设补偿控制 | 24h 内 |
| 低（审计追溯风险） | 登记备案，定期复核 | 下次审计前 |

处置建议模板见 `templates/sod-compliance-report.md` 的【L3必填】字段。

### Step 6: 输出 SoD 合规报告

按 `templates/sod-compliance-report.md` 生成报告：
- 冲突清单（直接 + 间接，含角色/权限对/风险/处置）
- 间接冲突路径表（L3）
- 角色权限变更审计记录（L3）
- 合规结论（通过/不通过 + 高风险冲突数）


## 档位切换规则

| 档位 | 触发条件 | 审批要求 |
|------|---------|---------|
| L1 草稿 | 内部权限对齐、非正式检查 | 无需评审 |
| L2 标准（默认） | 银行生产默认档，常规门禁评审与配置变更 | 合规确认 + 安全负责人签字 |
| L3 实施级 | 涉及资金安全/监管报送/跨系统集成/首次上线/高风险变更的SoD检查 | ARB/合规评审 + 深度门禁全通过 |

**自动升 L3 场景**：涉及反洗钱、限额参数、客户资金、监管报送、跨行接口、生产数据变更的SoD冲突检查时，自动从 L2 升 L3；L3 须通过下方「深度档位（L3 实施级）」章节的全部可计算门禁。

## 深度档位（L3 实施级）

| 档位 | 要求 |
|------|------|
| L1 | 骨架要点，用于讨论 |
| L2 | 标准评审级（银行生产默认） |
| L3 | 在L2基础上增加以下深度内容（高风险/监管/复杂集成时必用） |

### L3 工作流补充

- **传递闭包冲突矩阵**：输出权限冲突图 G 的传递闭包矩阵，标注每对冲突是"直接"还是"间接（N跳）"
- **间接冲突检测路径**：对每条间接冲突，输出完整路径（用户 → 角色 → 权限 → 冲突对），可追溯到具体用户与角色绑定记录
- **冲突严重度分级**：按资金/监管/流程/审计四类分级（高/中/低），高风险必须即时阻断
- **处置建议详表**：每条冲突附处置动作（分离/转授/补偿控制）、责任人、时效、验证方法
- **角色权限变更审计**：记录本次检查涉及的角色权限增删改，含变更人/变更时间/变更前后值/审批链

**传递闭包算法说明：**

```
输入: roles(角色→权限), user_roles(用户→角色), conflicts(冲突对)
输出: direct_conflicts[], indirect_conflicts[]

# 1. 直接冲突（单角色）
for role, perms in roles:
    for (a,b) in conflicts:
        if a in perms and b in perms:
            direct_conflicts.append({role, pair:[a,b]})

# 2. 间接冲突（用户多角色累积）
for user, rlist in user_roles:
    user_perms = ∪ roles[r] for r in rlist
    for (a,b) in conflicts:
        if a in user_perms and b in user_perms:
            # 排除已记为直接冲突的情况
            if not any(r has both a,b for r in rlist):
                indirect_conflicts.append({user, roles:rlist, pair:[a,b], path:...})

# 3. 冲突关系传递闭包（权限依赖链）
G = build_graph(conflicts)        # 权限为节点，冲突对为边
closure = floyd_warshall(G)       # 传递闭包矩阵
for role, perms in roles:
    expanded = closure_expand(perms)
    for (a,b) in pairs(expanded):
        if a,b in perms and (a,b) not in conflicts:
            indirect_conflicts.append({role, pair:[a,b], via:closure_path})
```

### L3 质量门禁

- [ ] 高风险冲突100%检出（直接 + 间接，零漏检）
- [ ] 间接冲突覆盖传递闭包（用户多角色累积 + 权限依赖链）
- [ ] 每条间接冲突有完整可追溯路径（用户→角色→权限→冲突对）
- [ ] 冲突严重度分级完成（高/中/低），高风险已阻断
- [ ] 处置建议100%可操作（含动作/责任人/时效/验证方法）
- [ ] 角色权限变更审计记录完整（变更人/时间/前后值/审批链）

> 主模板含【L3必填】深度字段：`templates/sod-compliance-report.md`；详细档位定义见《Skill深度分级规范》。

## 模板

| 模板 | 用途 |
|------|------|
| `templates/sod-compliance-report.md` | SoD 合规报告（含直接/间接冲突、路径、严重度、处置建议、变更审计） |

## 脚本

| 脚本 | 用途 | 退出码 |
|------|------|--------|
| `scripts/sod_check.py` | SoD 冲突自动检测（单角色直接冲突） | 0/2/3 |

### 脚本使用示例

```bash
# 基本检测（使用角色权限配置 JSON）
python skills/sod-compliance-check/scripts/sod_check.py config.json

# JSON 输出（供 Agent 消费）
python skills/sod-compliance-check/scripts/sod_check.py config.json --json

# 管道消费（退出码驱动 CI 门禁）
python skills/sod-compliance-check/scripts/sod_check.py config.json && echo "SoD合规" || echo "存在SoD冲突，请检查"
```

### 配置 JSON 格式

```json
{
  "roles": {
    "dev": ["编码", "单元测试"],
    "approver": ["代码评审", "批准MR"],
    "release": ["变更申请", "生产发布"]
  },
  "conflicts": [
    ["编码", "代码评审"],
    ["编码", "批准MR"],
    ["变更申请", "生产发布"]
  ]
}
```

### JSON 输出示例

```json
{
  "conflicts": [
    {"role": "dev", "pair": ["编码", "代码评审"]}
  ],
  "compliant": false
}
```

> **能力边界**：当前 `sod_check.py` 仅检测单角色直接冲突（同一角色内是否同时持有互斥权限对）。L3 的间接冲突（用户多角色累积、权限依赖传递闭包）尚未在脚本中实现，需通过上述算法人工计算或扩展工具支持，结果填入报告【L3必填】字段。详见 `scripts/README.md`。

## 参考资料

| 资料 | 用途 | 何时读取 |
|------|------|---------|
| `references/sod-matrix.md` | SoD 冲突矩阵（权限对/冲突类型/风险等级/合规依据/处置建议） | 任何 SoD 检查 |
| `references/sod-policy.md` | SoD 合规策略（职责分离原则/角色定义/权限分配规则/冲突处置流程） | 制度对齐/首次检查 |

## 质量门禁

- [ ] 冲突检测准确率100%（高风险零漏检）
- [ ] 告警有明确处置建议（含动作/责任人/时效）
- [ ] 间接冲突覆盖传递闭包（L3）
- [ ] 角色定义使用标准目录（无自定义别名）
- [ ] 门禁执行人 ≠ 审批人（四眼原则）

## 常见失败模式与规避

| 失败模式 | 表现 | 规避措施 | 重试策略 |
|---------|------|---------|---------|
| 角色定义模糊 | 使用"开发""测试"等口语化角色名，未对齐标准目录 | 标准化角色目录（见 `references/sod-policy.md`），配置前先做角色名校验 | 修正为标准角色名后重跑 |
| 间接冲突遗漏 | 单角色合规但用户多角色组合违规未被检出 | L3 启用传递闭包检测，输入 user_roles 展开累积权限集 | 补全 user_roles 后重跑 |
| 冲突矩阵不全 | 缺少"参数配置+参数审批""审计+数据修改"等银行场景冲突对 | 按开发/运维/参数/审计四类维护矩阵，季度校订 | 补充冲突对后重跑 |
| 门禁四眼失效 | 执行人与审批人为同一用户/同一角色 | 逐门禁校验 executor≠approver，L3 展开用户-角色绑定 | 分离角色绑定后重跑 |
| 处置建议空洞 | "请处理""注意合规"等无操作性建议 | 处置模板强制动作/责任人/时效/验证方法四要素 | 按模板重写后复核 |
| 权限名漂移 | "代码审查""代码评审""Review"混用导致漏检 | 权限名标准化，配置前做术语比对 | 统一为标准权限名后重跑 |

## 升级路径

| 升级方向 | 触发条件 | 增量字段 | 回退条件 |
|---------|---------|---------|---------|
| L1 → L2 | 进入正式门禁评审/配置变更 | 全部【L2必填】章节（角色权限配置/SoD冲突矩阵/合规报告） | 评审退回，降为草稿 |
| L2 → L3 | 资金安全/监管报送/跨系统集成/首次上线/高风险变更 | 传递闭包冲突矩阵、间接冲突检测路径、处置建议详表、角色权限变更审计 | 风险降级或场景简化，经合规确认可回 L2 |

**人工兜底点**：L3 的传递闭包冲突与处置建议须由合规与安全负责人共同确认；Agent 起草，合规确认后定稿。降级须经合规审批并记录原因。
