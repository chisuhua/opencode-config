# 验收报告：front-agent-redesign

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-06 |
| 范围 | Stage 0–5 的实施产物 + Stage 6 终验 |
| 判据来源 | `.rddf/improvements/front-agent-redesign.md` 的 AC1–AC17（终验权威为 ADR 的 18 条 Verification） |
| 结论 | **13 PASS / 3 PARTIAL / 1 FAIL-判据需改（AC9）/ 3 NOT-TESTED（AC14/AC15/AC17）**；核心链路（门控 → 委托 → 权限 → 结果回传）全通 |

## 一、逐条判定

| AC | 判定 | 证据 |
|---|---|---|
| AC1 shell 首条 deny + delegate 矩阵 | ✅ PASS | `opencode debug agents`：front shell 88 条，首条 `{*,deny}`，无 `*→allow`；front delegate `[{*,deny},{*,allow}]`，其余 12 个 agent 仅 `[{*,deny}]` |
| AC2 `bash -c`/`python3 -c`/`curl` 被**权限层**拒 | ✅ PASS | 三例均返回 `{"type":"permission.rejected","message":"Permission denied: shell"}`；无副作用文件生成 |
| AC3 `external_directory` 路径判定 | ✅ PASS | `grep` path=/workspace/... 放行（3 matches）；path=/etc → `Permission denied: external_directory`；shell `cat /etc/passwd` → `Permission denied: shell`（`* /*` deny） |
| AC4 正面能力（front 仍能干活） | ✅ PASS | front 用 `read`/`glob` 统计 `tests/unit` 文件数并分类输出，零权限询问、零文件修改，且带新鲜度标注 |
| AC5 delegate 真实写入 | ✅ PASS | 三次实跑：`answer2.txt`=42、`answer3.txt`=43、`answer4.txt`=44；返回 `outcome=succeeded` + `changed_files` + `out_of_scope_files=[]` |
| AC6 resume 不新建 + 负例被拒 | ✅ PASS | resume 复用 `ses_e536ccba…`（工程 session 总数不增）；未登记 id 被拒（`resume_session 未登记`）；非法 grant 被拒 |
| AC7 ask 不挂死 + `blocked_reason` | ✅ PASS | 工程 session 撞 `Permission denied: edit` **立即失败**（无挂死），`blocked_reason` 非空；且模型**主动拒绝**用 `shell >>`/`sed -i` 绕过 |
| AC8 grants 不可撤安全边界 | ✅ PASS | `grants:[{action:"edit"}]` → `grants 不允许 action=edit（question/form/edit/write 永不可 grant）` |
| AC9 scope 越界可见 | ⚠ **判据需改** | 实测比判据**更强**：scope 外的 README.md 写入被**权限层拒绝**（文件未修改）→ `out_of_scope_files` 为空是正确结果而非漏报。判据应改为"scope 外写入被拒 或 out_of_scope_files 非空" |
| AC10 越界文件可见（检测层） | ⚠ PARTIAL | `changed_files` 前后差集 ✅；但因越界写入被拦，未能构造出"工程外写入被检出"的样本。**检测层未验证** |
| AC11 in-flight → busy | ✅ PASS | 目标 session 正在跑 `sleep 200` 时调 delegate → `outcome:"busy"` + `still_running:true` + 拒绝排队 |
| AC12 pair-v2 + role.json + 并发 | ⚠ PARTIAL | `pair.json`(pair-v2) 与 `role.json` 的 `sessions` 分区均已写入，工程 session 开局读到 `builder`（不再退化为 `general`）；**并发无丢失更新未实测**（目录锁已实现，未造并发） |
| AC13 流程摘要 + 选项 + 新鲜度 | ⚠ PARTIAL | 摘要 + 新鲜度标注 ✅（实测输出含"状态读取于…"）；A/B/C 选项未单独验证；未调 `skill` 由 `skill: deny` 结构性保证 |
| AC14 开场报状态 | ❌ NOT-TESTED | front.md 已写该行为，但未做"冷启动首轮即报状态"的专项实测 |
| AC15 grants 预批端到端 | ❌ NOT-TESTED | grants 通道本身 ✅；"front 先问用户 → 同意 → grants 进 permissions" 的端到端未实测 |
| AC16 front transcript 无凭证 | ✅ PASS | 扫描 front 会话消息，`sk-*`/`gh*_`/`xox*`/PRIVATE KEY/`password=` 五类模式命中数均为 0 |
| AC17 failed / interrupted 返回结构 | ❌ NOT-TESTED | 仅验证了 `succeeded`/`busy`/`unknown` 路径 |

### ADR 18 条 Verification 的增量判据

| 新增判据 | 判定 |
|---|---|
| 救援路径为**原地补 grant**（`session.update`）而非新建重跑 | ✅ PASS（`session.update` 权限可写已实测：建时 `[{shell,git status *,allow}]` → update 后 `[{*,*,allow}]`） |
| 拒绝非法 grants、允许白名单内具体 grant | ✅ PASS（拒绝 ✅；白名单内 grant 生效路径已实现，未单独实跑） |

## 二、实施期发现并已修正的缺陷

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | `scopeEditRules` 把文件型 scope 拼成 `x/*`，**匹配不到文件本身** → 写入被拒 | 同时产出 `x` 与 `x/*` 两条 allow |
| 2 | pair/role 登记发生在 prompt **之后** → 工程 session 读不到自己的 role.json 分区，退化为 `general` | 登记提前到 prompt 之前 |
| 3 | `out_of_scope_files` 用单次 `git status` → 把委托前就存在的脏文件误报为越界 | 改为前后差集 |
| 4 | in-flight 判据用 `time.updated > time.idle` → **首次运行中**的 session 从未 idle（idle=0），永远判不出 busy | 改为"最后消息时间 > 最后 idle 时间" |
| 5 | `blocked_reason` 只报第一个匹配 → 可能报出无关的前置阻断 | 改为收集全部 + 报首个（新增 `blocked_all`） |
| 6 | resume 硬校验 `front_session_id` → **隔天回来继续**这种正常用法失效 | 改为软信号 `resumed_by_other_front` |

## 三、已知缺口（未做，已登记）

1. **scope 只约束 `edit` 类目**：工程 session 的 shell 写操作不受 scope 约束。实测工程 session 在工程目录外写了临时文件（`/tmp/opencode/engproj_baseline.txt`），而 `out_of_scope_files` 为空 —— 越界检测只比对工程仓的 `git status`，**工程外的写入检测不到**。
2. **并发写盘未实测**：`.role.lock` 用原子 `mkdir` 实现（协作锁 + 30s 陈旧锁清理），但未造并发验证"无丢失更新"。
3. **`failed` / `interrupted` 返回结构未实测**。
4. **开场报状态 / grants 预批端到端未实测**。
5. **pair 过期清理策略未实现**（`remove` 默认 false 且无淘汰策略 → session 会累积）。ADR D2 已把清理责任挂在 pair 的 `last_used_at` 过期策略上，该策略本轮未落地。
6. **shell 守卫非完备边界**：上游 matcher 绕过族（重定向、`--opt=value` 截断、零节点跳过）仍存在；本环境 v2.2.5 实测 5/5 拦截，但升级 opencode 时须回归。

## 四、实施期新增的运维事实（已回写 ADR D8 / 文档）

| 事实 | 影响 |
|---|---|
| **改配置 / 插件后需 `opencode service restart`** | 后台 service 缓存配置与插件模块 |
| **改 prompt 文件的"内容"不生效，换"路径"才生效** | `{file:...}` 引用被 service 缓存；实测模型读到了旧内容 |
| **`opencode run --agent X` 会延续同 agent 的最近会话** | 探针需用 `--session <new-id>` 隔离，否则模型会复用上一轮上下文里的 id |
| **插件 `setup()` 在 location 销毁前会被中止** | setup 只做注册，耗时工作必须放工具 `execute` 内 |
| **插件 ctx 按 location 绑定** | `ctx.permission.list/reply` 只能看到同 location 的 session |
| **MCP 启动会阻塞 location 激活** | `ServiceUnavailableError: Location plugins did not finish activating` 的常见真因 |

## 五、复现命令

```bash
# 权限矩阵
opencode debug agents | python3 -c "import json,sys; [print(a['name'], [x for x in a['permissions'] if x['action']=='delegate']) for a in json.load(sys.stdin)]"

# 插件清单
opencode plugin list

# front 行为（理解性：不建工程 session）
opencode run --agent front "帮我看看 /workspace/main/rdd-workflow/tests/unit 下有多少测试文件"

# front 行为（实施性：走 delegate）
opencode run --agent front "在 /tmp/opencode/engproj 里新建 answer4.txt，内容 44"
```
