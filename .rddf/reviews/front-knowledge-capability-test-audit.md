# 测试完备性审计 + E2E 可行性评估（front-knowledge-capability）

- 日期：2026-11-08
- 角色：verifier（只审计，不改实现 / 不改测试）
- 对象：commit `c81af29`；被测工程 `~/.config/opencode`；候选 E2E 宿主 `/workspace/main/rdd-workflow-e2e`
- 结论：**单测层面覆盖率 98.05%，但有 4 个契约相关分支未覆盖；E2E 层面运行时强制完全未覆盖。在 e2e 工程上建 E2E 测试集 —— 可行，且已有一份可直接扩展的 bats 骨架（当前未入库）。**

## 1. 单测完备性

### 1.1 覆盖率（工具证据）

```
bun test tests/ --coverage
All files                    | 100.00 % Funcs | 98.05 % Lines
lib/delegate-core.ts         | 100.00 % Funcs | 96.11 % Lines  uncovered: 108-109,145,169-170,324-333,335,337,357,603,611,699,710
lib/model-fallback-core.ts   | 100.00 % Funcs | 100.00 % Lines
116 pass / 0 fail / 307 expect()
```

### 1.2 未覆盖分支逐条判读

| 行 | 分支 | 风险 | 判定 |
|---|---|---|---|
| 710 | `newActivity === false → outcome = "unknown"` | **高** | **契约要求**（旧 ADR D2：无新活动不得采信旧 outcome）。完全没有用例 |
| 603 | resume 时 `canonical_root` 不匹配 → 拒 | 中 | 访问控制分支，无用例 |
| 611 | resume 时显式 agent 与登记 agent 不一致 → 拒 | **高** | 本次新增的 H1b 配套分支；只测了"agent 非白名单"，没测"agent 不一致" |
| 699 | `session.wait` 抛错 / 超时 → `wait_error` | 中 | 失败路径无用例；超时路径还意味着"30 分钟内不返回"无法测 |
| 357 | `readJson` 遇到损坏 JSON → `undefined` | 低 | 容错分支 |
| 324-337 | `withLock` 的 EEXIST 竞争 / 30s 陈旧锁回收 | 中 | 现有"并发"用例是**串行**调用，未真正并发；陈旧锁回收未测 |
| 167-170 | 绝对路径 scope 解析到工程根（`normalized === ""`） | 低 | 与 `scope="."` 分支语义重叠 |
| 108-109 | `toMillis` 的 Date / 非法字符串分支 | 低 | 工具函数容错 |
| 145 | `gitStatusPaths` 的 catch（git 报错） | 低 | 环境异常分支 |

### 1.3 与 ADR Verification 的差距

- 已覆盖：白名单（create + resume 非白名单）、知识 session 只读语义、knowledge 不写 role、grants 约束、ledger 行时机/字段/脱敏、幂等重登记、消防态（同 commit）。
- **未覆盖**：Verification #11 的**并发**（两次 delegate 同时触发）；`outcome=unknown` 这条虽属旧 ADR，但本次代码路径仍在、且是失败语义的关键分支。
- 结论：**核心契约覆盖良好，"失败/并发/未知结果"三类路径有缺口。**

## 2. E2E 可行性：`/workspace/main/rdd-workflow-e2e`

### 2.1 工程适配性（实测）

| 项 | 事实 | 判定 |
|---|---|---|
| 测试框架 | bats-core 已安装（`/home/ubuntu/.local/share/pnpm/bin/bats`） | ✅ |
| 现有集成测试 | `tests/integration/` 7 个已入库 bats 文件 + 1 个**未入库**的 L2 运行时文件 | ✅ |
| L2 骨架 | `tests/integration/test_front_delegate_runtime.bats`（834 行，L2-1…L2-8） | ✅ 可直接扩展 |
| 默认门控 | `E2E_REAL_RUNTIME=1` 才真跑；默认全 skip、exit 0 | ✅ 不进 CI |
| 隔离工程 | `l2_fixture_project` 复制工作树到 `/workspace/main/rdd-workflow-e2e-l2`、清 pair/role、重新 `git init` | ✅ 已验证 |
| 事件解析 | `--format json` NDJSON 逐行解析 `tool_use`，提取 delegate 入参/summary | ✅ `opencode run --format json` 存在 |
| 超时 | 单次委托独立 `timeout`（默认 300s），超时判 FAIL | ✅ |
| 断言口径 | 只断言文件系统事实 + 结构化字段，**不断言自然语言** | ✅ 正确做法 |
| 空跑验证 | `bats test_front_delegate_runtime.bats` → 8 skip、exit 0 | ✅ 实测通过 |
| 免模型用例 | `E2E_REAL_RUNTIME=1 bats -f 'L2-1'` → **ok**（仅读 `debug agents`） | ✅ 实测通过 |

### 2.2 现有 8 条 L2 与本次变更的关系

| 用例 | 覆盖 | 本次是否仍有效 |
|---|---|---|
| L2-1 工具门控（delegate 仅 front） | 配置 | ✅ 有效 |
| L2-2 front edit 被拒 | 配置 + 文件事实 | ✅ 有效 |
| L2-3 真委托写文件 | build 路径 | ✅ 有效（契约未变） |
| L2-4 pair/role 登记（builder） | build 路径 | ✅ 有效（pair 新增 `kind` 不影响该断言） |
| L2-5 scope 越界被拒 | build 路径 | ✅ 有效 |
| L2-6 非法 grants 被拒 | build 路径 | ✅ 有效 |
| L2-7 busy 不排队 | build 路径 | ✅ 有效 |
| L2-8 resume 不新建 | build 路径 | ✅ 有效 |

**但这 8 条全部是"变更前契约"**，没有一条覆盖本次新增的：agent 白名单、知识 session、ledger、subagent 放行/加固。

### 2.3 必须新增的 E2E 用例（建议 6 条）

| 新用例 | 断言（结构化事实） | 是否需模型 |
|---|---|---|
| **L2-9** agent 白名单：`delegate(agent="general")` | 无 `session_id`（参数校验阶段拒）；fixture 下无 `pair.json` 新增 | ✅ 1 次 |
| **L2-10** 知识 session：`delegate(agent="explore", scope=[])` | summary `kind=="knowledge"`；`pair.json` 该条 `kind=="knowledge"`；`role.json` 的 `sessions` **不含**该 id；结论文本非空 | ✅ 1 次 |
| **L2-11** ledger 落盘 | `<fixture>/.rddf/state/ledger.jsonl` 存在；恰 1 行；字段含 `recorded_at/backend_session_id/kind/outcome`；`last_assistant_text` 不含形如 `oc_sk_` 的串 | ✅ 复用 L2-10 / L2-3 产物 |
| **L2-12** 加固：explore 执行 `bash -c 'touch /tmp/x'` | 工具事件 `state.status=="error"` 且 `permission.rejected`；`/tmp/x` 不存在 | ✅ 1 次（front 召 explore 跑命令，或 front 报出被拒） |
| **L2-13** librarian 网络守卫 | `curl -o /tmp/x URL` 被拒；`git clone URL /etc/x` 被拒 | ✅ 1 次（可合并进 L2-12 的同一子 agent 会话） |
| **L2-14** front 可召只读 subagent、且 general 仍被拒 | `debug agents` 的 subagent 规则（五 allow + `*` deny）；真实调用 explore 成功、general 报权限错 | ⚠️ 前一半免模型，后一半同 L2-12 |

额度估算：新增用例若复用场景缓存，净增约 **3–4 次真实委托**（每次 ≤300s）。

### 2.4 阻塞与风险（必须先解决/接受）

| # | 问题 | 影响 | 处置 |
|---|---|---|---|
| B1 | **运行中的 service 是旧插件**（启动 16:41 < 修改 18:47） | 所有新 `delegate` 行为在 E2E 中仍是旧代码 | 跑 E2E 前 `opencode service restart` |
| B2 | `opencode debug agents` 首次调用可能非 JSON（实测 L2-1 首跑失败、复跑通过） | 配置类用例偶发假失败 | 用例内加重试（≤3 次）或从输出中截取首个 `[` 到末尾 `]` |
| B3 | 模型非确定性（是否按 prompt 传参） | 用例可能"判据未触发"而非真失败 | 已在骨架里用 `l2_classify` 区分 `rejected_param / busy / executed_mismatch / missing`，沿用 |
| B4 | 真实模型额度 | 成本 | 默认 skip + 场景缓存（骨架已有） |
| B5 | **L2 文件当前未入库**（`?? tests/integration/test_front_delegate_runtime.bats`，mtime 11-06） | 后续改动无版本记录 | 先由 builder 在 e2e 仓库提交该文件，再增量改 |
| B6 | E2E 在**另一个 git 仓库** | 提交/评审属于 e2e 仓库的流程 | 需要用户确认是否允许在 e2e 仓库提交 |

## 3. 结论与建议

1. **单测不够完备但不是"不达标"**：98.05% 行覆盖、核心契约齐；缺 3 类失败/并发分支（`unknown`、resume 两处拒绝、并发 delegate）。建议补 4 条单测（约 30 行），优先级：`unknown` > resume agent mismatch > resume canonical_root mismatch > 并发/超时。
2. **E2E 完全可行，且成本低于从零搭**：`/workspace/main/rdd-workflow-e2e` 已有 bats 骨架，隔离、NDJSON 解析、超时、分类器都已解决。只需新增 6 条用例（净增 3–4 次模型调用）。
3. **必须先做**：`opencode service restart`（B1）+ 把未入库的 L2 文件提交（B5）。
4. **角色路由**：补单测 / 改 E2E / 在 e2e 仓库提交都是**实施**工作 → 切 **builder**。verifier 只负责跑与判定。

## 4. 已用轮次

- 本 change 验收轮次：1 / 3（本次为补充审计，不计失败返工）。
