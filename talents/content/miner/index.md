# 开发范式索引

> 自动生成，请勿手改。每次归档 spec 后由 icode-miner 引擎重建。

| 名称 | 描述 | 首次归档时间 |
| --- | --- | --- |
| [Spending Cashback and Reward Issuance](<./Spending Cashback and Reward Issuance/summary.md>) | 实现消费后返现/积分奖励的开发范式：活动资格校验、按比例计算奖励、入账后触发发奖、幂等入账与失败重试 | 2026-10-27T11:06:20+08:00 |
| [Cross-Service Idempotent Posting and Retry](<./Cross-Service Idempotent Posting and Retry/summary.md>) | 跨服务奖励幂等入账开发范式：重复评估检查、账户入账去重、失败保留待处理状态及人工重试 | 2026-10-27T17:44:44+08:00 |
| [Campaign Eligibility and Validity Control](<./Campaign Eligibility and Validity Control/summary.md>) | 营销活动资格校验与有效期控制开发范式：活动状态机与时间窗、账户状态与目标账户组、报名及参与限制的判定链实现 | 2026-10-27T17:50:06+08:00 |
| [Account Balance Optimistic Lock Update](<./Account Balance Optimistic Lock Update/summary.md>) | 账户余额更新并发控制的乐观锁实现范式：实体版本字段、事务内余额变更与统一 409 冲突响应 | 2026-10-27T18:45:20+08:00 |
| [User Maintenance and Delete Protection](<./User Maintenance and Delete Protection/summary.md>) | 用户新增、修改与删除的开发范式：类型校验、密码哈希存储、禁止自删除与保留最后一名管理员 | 2026-10-27T18:50:50+08:00 |
| [Unified Error Codes and Exception Handling](<./Unified Error Codes and Exception Handling/summary.md>) | 新增校验或调用其他服务时的错误处理范式：领域异常、出站失败转换、全局异常映射为统一错误响应 | 2026-10-24T17:10:00+08:00 |
