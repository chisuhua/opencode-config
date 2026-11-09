# 探针报告：front 多后端 session 管理（前置事实，v2.2.5）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 执行 | build agent（按用户指示落探针，为后续 ADR 提供前置事实） |
| 环境 | OpenCode v2.2.5（已装二进制）；后台 service `http://127.0.0.1:49374`（Basic auth 取自 `~/.config/opencode/service.json`）；上游源码 checkout `/tmp/opencode/upstream-v225`（tag `v2.2.5`，commit `9bbb8ce18c`） |
| 探针脚本 | HTTP 层：`/tmp/opencode/probe/p{1,2,2b,2c,3_p6,4,5,6b,7,8,9}*.sh`；插件内直测：round 1–6 临时探针插件（已删）；原始返回 `/tmp/opencode/probe/out/*.json` |
| 结论 | **HTTP 层 8 条 + 插件内直测 8 条 + oracle 后补 3 条 = 19 条探针全部有答案；4 条推翻既有文档判断（delivery 语义、list 枚举能力、list item 的 metadata、running 信号），1 条坐实既有 bug（canonicalRoot 口径）** |

> 探针口径说明：HTTP API（`/api/session*`）与插件 `ctx.session.*` 在 v2.2.5 里**同源**——插件 promise 适配层（`packages/plugin/src/promise/adapter.ts:622-642`）逐个方法 `adaptApiMethod(SessionEndpoints[...], host.session.…)`，两端最终都落到同一个 `Session.Service`。故本报告的 HTTP 实测结论可直接外推到插件 ctx。

---

## P1 —— metadata 全链路（create → get/list → update）✅ 可用

**结论：metadata 写入/读回/改写全链路可用，是可承载名册索引的宿主原语。**

| 步骤 | 实测 |
|---|---|
| create 传 metadata | `POST /api/session` 带 `metadata:{delegated_by,probe,goal,canonical_root,baseline_message_id,dispatched_at}` → 响应 `data.metadata` 原样回显 |
| get 读回 | `GET /api/session/{id}` → `data.metadata` 与写入完全一致 |
| list 读出 | `GET /api/session?limit=5` → 命中的那条 item **带 `metadata` 字段**（值一致） |
| update 改写 | `PATCH /api/session/{id}` 带新 metadata → 再 get，`goal` 已改写、`state:"running"` 已加入 |

**关键细节**：
- metadata 是**整体替换**语义，不是 merge。探针中 patch 后 `dispatched_at`/`baseline_message_id` 等未重传的字段**全部消失**，只剩重传的那几个。→ 插件每次 update 必须**回传完整 metadata 对象**，否则索引字段会被抹掉。
- `metadata` 字段类型 = `Record<string, Json>`（`packages/schema/src/session-metadata.ts:8`），任意 JSON 值合法。

**对方案的影响**：metadata 索引路线**在宿主侧完全成立**，无需自造存储。

---

## P2 / P2b / P2c —— list 的形状、分页、跨目录枚举 ⚠️ 推翻部分既有判断

### P2.1 返回形状

```
GET /api/session?limit=5
→ { "data": [...], "cursor": { "previous": <string|undefined>, "next": <string|undefined> } }
```

- **不是裸数组**——插件侧 `ctx.session.list()` 返回的也是 `{data, cursor}` 信封（adapter 走 HTTP endpoint 的 success schema，`packages/protocol/src/groups/session.ts:126-144`）。
- **默认 limit = 50**（不传 limit 时实测 `data.len = 50`；上游 `DefaultListLimit = 50`，`packages/core/src/session.ts:84`）。
- 传 `limit=200` 实测返回 200 条 → 上限不硬性封顶。

### P2.2 分页

- `cursor.next` 是 base64url 不透明串；带上 `cursor` + `limit` 请求下一页。
- **相邻页无重叠**（page1∩page2 = ∅）。

### P2.3 跨目录枚举 ⚠️ 关键发现

`GET /api/session` **不带 `directory` 参数时返回全库 session，且混合多个目录**：

```
limit=100 → 22 个不同 directory，分布：
   20  /workspace/main/rdd-workflow-e2e-l2/engproj-busy2
   13  /home/ubuntu/.config/opencode
   11  /workspace/project/CppHDL
   10  /workspace/main/rdd-workflow-e2e-l2/engproj-subagent-guard
    7  /workspace/project/CppTLM  /  7  /workspace/project/ChipForge
   ...
```

→ **"front 名下有哪些后端"是全局可枚举的，不需要跨工程各读一份 pair.json**。这直接回答了原设计的核心难点。

### P2.4 过滤能力盘点（决定索引怎么查）

| 过滤维度 | 服务端支持？ | 证据 |
|---|---|---|
| `directory` | ✅ | `?directory=/tmp/.../engproj2` → 只回该目录 |
| `search`（title LIKE） | ✅ | `?search=[fd]` → 只回 2 条带标记会话；`search=fd`/`search=FD` 同样命中 → **LIKE 大小写不敏感** |
| `parentID` | ✅（但不可用于本场景） | delegate 建的 session 无 parent；且上游 `Session.create` 在有 parentID 时 **location 继承自父 session**（`packages/core/src/session.ts:279`），无法表达"front 在 A 目录、管 B 目录的后端" |
| `archived` | ✅ | schema 存在 |
| **`metadata` 过滤** | ❌ | list 的 filter 字段只有 directory/workspaceID/project/subpath/search/parentID/archived（`packages/core/src/session.ts:17-38`）。**没有按 metadata 过滤的条件** |

### P2.5 ⚠️ 列表项不含 metadata 的两种情形（初次探测的误读已澄清）

- 全库 list（`?limit=100`，无 directory）→ **22 个目录混合**，`metadata in any item = False`。
- 但带 `directory` 过滤的 list、以及 P2c 的全库 limit=200 list → **带 metadata 的 item 都在**（P2c 一次 list 拿到 2 个 `delegated_by=front-delegate` 标记项，且**无需逐条 get**）。

→ 结论修正：**list item 是否含 metadata，取决于该 session 自身有没有 metadata**（无则字段缺省），**不是被 list 层裁掉**。既有的"list 后必须逐条 get 才能拿 metadata"判断**不成立**。

### P2c 名册查询可行性终检

```
一次 GET /api/session?limit=200
→ data[0..1] 即两个标记项（marker=A1 / B1，分属不同目录）
→ metadata 完整（marker/goal/canonical_root/...）
→ 无需逐条 get
```

**唯一的窗口风险**：list 按 **`time_updated` 降序**（P8.4 实测：序列单调递减），不是 `created`。→ **长期 idle 的后端 session 会沉出 limit 窗口**。名册查询若只扫一页会漏；必须用 cursor 续扫，或改用 `search`（title 标记）做服务端收窄。

---

## P3 —— interrupt 语义 ✅ 已明确

| 场景 | 实测返回 | session 状态 |
|---|---|---|
| idle session + `interrupt?resume=false` | `{"interrupted": false}` | 无变化（`outcome=None`，`idle=None`）→ **纯 no-op，不报错** |
| 运行中 + `interrupt?resume=false` | `{"interrupted": true}` | `outcome=interrupted`，`idle` 被写入 |

上游语义（`packages/core/src/session/execution.ts:151-167`）：`resume=false` 时中断后**不**唤醒后续输入；`resume=true` 时会从 inbox 里取下一个可 promote 项并 `wake(sessionID,"steer")` 续跑。

→ `cancel` 工具契约可定：`interrupt({resume:false})` 停当前 run 且不留后患；返回值 `interrupted:false` = 当时没在跑（幂等安全，可直接告诉用户"本来就没在跑"）。

---

## P4 —— git 根口径判别式 ⚠️ 坐实既有 bug

三种场景实测（`--path-format=absolute --git-common-dir`）：

| 场景 | `--show-toplevel` | abs `--git-common-dir` | `--show-superproject-working-tree` |
|---|---|---|---|
| 主仓 | `/…/main` | `/…/main/.git` | 空 |
| **linked worktree** | `/…/wt` | **`/…/main/.git`** | 空 |
| **submodule 工作树** | `/…/super/vendor/sub` | **`/…/super/.git/modules/vendor/sub`** | **`/…/super`** |

**两个结论**：

1. **worktree 下 `--show-toplevel` ≠ 主仓身份**。`lib/delegate-core.ts:115` 用 `--show-toplevel` 算 `canonical_root` → 在 worktree 里会把 `pair.json` / `role.json` / `ledger.jsonl` 落到 **worktree 工作树副本**，主仓看不到；build agent 按主仓路径读 role.json 就读不到自己那份 → **两份状态文件物理分裂，resume 直接查无此条**。这与 `prompts/build.md:195,199` 要求的「worktree → canonical 归一（`git rev-parse --git-common-dir`）」**口径不一致**，是 bug 不是风格差异。

2. **submodule 是陷阱**：abs `--git-common-dir` 指向 `.git/modules/...`，直接 `dirname` 会得到 `.git/modules/vendor` 这种**非工作区路径**当状态根。必须用 `--show-superproject-working-tree` 判定并归一到 superproject 工作树。

**归一函数（探针验证过的形态）**：

```
stateRoot = superproject-wt 非空 ? superproject-wt
          : dirname(abs(--git-common-dir))
workRoot  = abs(--show-toplevel)
主仓场景：stateRoot == workRoot（行为零变化）
worktree：stateRoot=主仓, workRoot=worktree（两者必须分开用）
```

---

## P5 / P6 —— ⚠️⚠️ 推翻既有判断：上游 prompt 默认是 **steer**，不是 queue

### P5.1 默认 delivery

```
POST /api/session/{id}/prompt  {"text":"..."}          → 返回 delivery = "steer"
POST /api/session/{id}/prompt  {"text":"...","delivery":"queue"} → delivery = "queue"
```

上游源码印证：`packages/core/src/session/session.ts:165` `delivery: input.delivery ?? "steer"`；`packages/core/src/session/prompt.ts:52` 同。枚举只有两值：`["steer","queue"]`（`packages/schema/src/session-inbox.ts:11`）。

### P5.2 连投多条的行为

用 `resume:false`（只入队不唤醒）连投 3 条 → inbox 累积 3 条，**全部 `delivery=steer`**；再显式投 1 条 `delivery=queue` → inbox 共 4 条，第 4 条是 queue。

→ **steer 可以无限累积多条**（不像 queue 一次只 promote 一条，`packages/core/src/session/inbox.ts:590-600` 的 `limit(1)`）。

### P6 ⚠️ steer 的真实语义 = 注入当前轮

真实模型运行实测：run 进行中（第 2 秒）投第二条 prompt，最终 assistant 回复的是 **SECOND 而不是 FIRST**：

```
message count = 5
   [user]      ← 第一条
   [assistant]
   [user]      ← 第二条（steer，注入进同一轮）
   [assistant] SECOND   ← 最终答复被第二条改写
   [idle]
```

上游机制：`promote` 在 scope="input" 时先处理 `pendingSteers`（**全部** steer 一次性 publish，`packages/core/src/session/inbox.ts:583-588`），steer 落在**当前轮**的 step 边界注入。

### 对既有设计的三处修正

| 既有文档说法 | 修正 |
|---|---|
| `docs/front-delegate-architecture.md` §4.3「同一 session 已有 in-flight run 时会排队（所以要有 busy 保护）」 | **"排队"不准确**：上游默认 steer = **注入当前轮并改写它**。插件层"busy 拒绝"是**主动选择**（拦掉改写），这个选择是对的，但**理由要改写**：不是"避免排队堆积"，而是"避免 steer 改写正在执行的目标"。 |
| ADR `D2`「resume 时校验 …」隐含"投递 = 追加新一轮" | **投递语义必须显式选**：想"排队到下一轮"要显式 `delivery:"queue"`；想"插话当前轮"是默认 steer。**async dispatch 的 prompt 必须显式指定 delivery**，否则语义含糊。 |
| ADR-delegate-delivery-evidence 的 outcome 枚举 | 不受影响（delivery 只改投递时机，不改终态判定） |

**对"上下文干净"这个诉求的直接支撑**：steer 注入当前轮 = 后端正在做的目标被新简报改写 = **上下文污染**。这为「一 session 一目标 + 目标不一致就换 session」提供了**宿主层机制层面的理由**，不只是设计洁癖。

---

## P7 —— `search` 可作服务端收窄入口 ✅

`search` = title LIKE（`packages/core/src/session/store.ts:155`），实测**大小写不敏感**：

```
?search=[fd]  → 2 hits（'[fd] 加缓存' / '[fd] 修登录 bug'）
?search=fd    → 2 hits（同样两条）
?search=FD    → 2 hits（同样两条）
?search=[fd]&limit=1 → 1 hit
```

→ 名册可以给每个后端 session 一个**带固定前缀的 title**（如 `[fd] <目标摘要>`），用 `?search=[fd]` 一次拿到全部，**服务端收窄 + 可分页**，不必扫全库。

⚠️ 副作用：title 会出现在用户可见的 session 列表里，前缀是可见噪声；且 `search` 与 `metadata` 是**两套标记**，需保证一致（可由插件单一写点保证）。

---

## P8 —— 索引可丢弃性 + list 排序 ✅

| 探针 | 结果 |
|---|---|
| remove 前 list 能看到 | hits = 1 |
| `DELETE /api/session/{id}` | 204 |
| remove 后 list | hits = 0 |
| remove 后 get | **404** `SessionNotFoundError` |
| list 排序字段 | `time.updated` **降序**（实测序列单调递减），非 `created` |

→ **metadata 索引随 session 消失而消失，事实历史需另存**（ledger.jsonl）。这正是"metadata 只当可丢弃索引、不当真相源"的宿主层保证——**索引不会悬挂**（session 被删 → 索引自动消失；session 还在但跑完了 → 索引还在，需要 reconcile 补终态）。

---

## 汇总：探针给出的事实 → 方案修正

| # | 事实 | 对方案的影响 |
|---|---|---|
| 1 | metadata 全链路可用（create/get/list/update），update 是**整体替换** | 名册索引路线成立；插件必须回传完整 metadata |
| 2 | list 支持**跨目录全库枚举**，且 list item **自带 metadata** | "front 名下有哪些后端"不需要跨工程读 pair.json，也不需要逐条 get |
| 3 | list 默认 limit=50，按 `time_updated` 降序 | 只扫一页会漏掉长期 idle 的后端 → 必须 cursor 续扫 **或**用 `search` 收窄（P7） |
| 4 | list **不支持按 metadata 过滤** | 索引查询需 title 前缀 + `search`，或客户端过滤 |
| 5 | `search` 按 title LIKE，**大小写不敏感** | 可作服务端收窄入口，代价是 title 可见噪声 |
| 6 | `parentID` 不可用（location 继承自父） | 排除"用 session 树表达 front→backend 关系" |
| 7 | `--show-toplevel` 在 worktree 下 ≠ 主仓身份 | canonicalRoot 是**真 bug**；且必须拆 stateRoot / workRoot 两个根 |
| 8 | submodule 的 common-dir 指向 `.git/modules/...` | 归一函数必须先判 superproject |
| 9 | **上游 prompt 默认 steer = 注入当前轮并改写它** | 修正既有文档；dispatch 必须**显式指定 delivery**；这是"上下文污染"的宿主机制证据 |
| 10 | interrupt：idle → `{interrupted:false}` no-op；运行中 → `{interrupted:true}` + `outcome=interrupted` | `cancel` 契约可定，幂等安全 |
| 11 | remove 后 list/get 都查不到（404） | 索引随 session 消失 → 不会悬挂；历史靠 ledger |
| 12 | `queue` 一次只 promote 一条；`steer` 可多条一起注入 | 聚合/批量语义要按 delivery 分别处理 |

---

# 第二部分：插件内直测（round 1–3）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 目的 | 补齐 HTTP 层探针**覆盖不到**的插件 ctx 真实语义（假 ctx 覆盖不到宿主行为） |
| 方法 | 临时探针插件 `plugins/probe-ctx{,2,3}.ts` 装入 `~/.config/opencode/plugins/`，在 `/tmp/opencode/probe/trigger` 目录触发真实 location（`opencode run --agent general`），插件 setup 内调 `ctx.session.*` 并把结果写 `/tmp/opencode/probe/out/plugin-ctx{,2,3}.json`；**三轮跑完即删插件并 `opencode service restart`** |
| 边界 | **未改 `lib/delegate-core.ts`**（实现代码，verifier 不碰）；探针插件是独立文件，跑完已从运行时卸载（`opencode plugin list` 复核无残留）；`git status` 仅余本报告文件 |
| 结论 | **6 条待验项全部有答案；其中 3 条修正了 HTTP 层的推断** |

## Q1 —— `ctx.session.list()` 的返回形状 ⚠️ 不是数组

```
ctx.session.list() →
{
  js_type: "object",
  top_keys: ["data", "cursor"],
  data_is_array: true,
  data_len: 50,                    ← 默认 limit=50（与 HTTP 层一致）
  cursor_keys: ["previous", "next"],
  item_keys: ["id","projectID","agent","cost","tokens","time","location"]
}
```

→ **插件 ctx 返回 `{data, cursor}` 信封，不是裸数组**。现有 `delegate-core.ts` 未用过 `session.list`，无兼容问题；但新工具若按数组写会踩坑。

## Q2 —— `ctx.session.get()` 的 outcome / idle 在**顶层** ✅ 现有读法成立

等真实 run 结束后：

```
ctx.session.get({sessionID}) →
  top_keys: ["id","projectID","agent","cost","tokens","outcome","time","title","metadata","location"]
  top_level_outcome: "succeeded"     ← 顶层，不是 data.outcome
  top_level_time_keys: ["created","updated","busy","idle"]
  top_level_idle: 1794194495086
  nested_data_outcome: null          ← 没有 data 包装层
```

→ **`delegate-core.ts` 现有的 `after.outcome` / `after.time.idle` 读法成立**，不必改。

⚠️ **但有陷阱**：`ctx.session.get()` 在 **run 尚未结束时**，`outcome` 字段**整个不存在**（`top_level_outcome: null`、`top_keys` 里没有 `outcome`、`time` 只有 `created`/`updated`，无 `busy`/`idle`）。→ 轮询判"是否还在跑"**不能只看 `outcome` 是否为 null**（未开始/进行中/从未运行三者都读作 null），必须用 `time.busy` / `time.idle` 的组合。这也解释了既有 busy 判定为何要用「最后消息时间 > 最后 idle 时间」——**方向正确，保留**。

## Q3 —— 跨目录 create + parentID 互斥 ✅ 已定死

| 场景 | 实测 |
|---|---|
| `create({location:{directory: OTHER_DIR}, metadata})` | 成功，`created_location = /tmp/opencode/probe/other`，`get` 也回同一目录，**metadata 原样回显** |
| `create({parentID: P, location:{directory: TRIGGER_DIR}})`（P 在 OTHER_DIR） | `actual_location = /tmp/opencode/probe/other` = **父的目录**；`parentID` 字段正确写入 |

→ **传 parentID 时 location 被忽略、继承父 session 的目录**。排除"用 session 树表达 front→backend"这条路的依据**在插件 ctx 内同样成立**（不只在 HTTP 层）。

## Q4 —— `ctx.session.prompt({delivery})` 参数名 ✅ 直传直生效

```
ctx.session.prompt({sessionID, text, delivery:"queue", resume:false})
  → { keys:["id","sessionID","time","type","payload","delivery"], delivery: "queue" }

ctx.session.prompt({sessionID, text, resume:false})     ← 不传 delivery
  → delivery: "steer"      ← 默认 steer 再次在插件 ctx 内确认
```

→ 插件 ctx 的 `prompt` **直接接受 `delivery` 参数**，取值 `"queue" | "steer"`，**默认 `"steer"`**。async dispatch 可以显式选语义。

## Q5 —— `ctx.session.update({metadata})` 整体替换 ⚠️ 与 HTTP 层一致

```
create(metadata={a:1, b:2}) → update(metadata={only:"c"}) → get.metadata
  = { only: "c" }        ← a / b 消失，未合并
```

→ **整体替换**语义，插件每次 update 必须回传完整 metadata 对象。

## Q6 —— `ctx.session.interrupt()` 返回形状 ✅

```
ctx.session.interrupt({sessionID}) → { keys:["interrupted"], value:{interrupted:false} }
```

→ 只有 `interrupted` 一个字段，idle 时为 `false`（幂等 no-op）。

## Q7 —— list 的过滤在**插件 ctx 内同样生效**（HTTP 层结论已在插件侧复核）

在插件 ctx 内造 A（OTHER_DIR，title `[fd] probe3-A`）+ B（TRIGGER_DIR，title `probe3-B`）后：

| 调用 | 实测 |
|---|---|
| `list({directory: OTHER_DIR})` | len=1，只含 A，dirs=[OTHER_DIR] ✅ 真过滤 |
| `list({search:"[fd]"})` | len=1，只含 `[fd] probe3-A`，且该 item **带 metadata** ✅ |
| `list({limit:100})` | len=100，**23 个不同 directory**（跨目录全库枚举 ✅），其中 2 个带 `delegated_by=front-delegate` 标记的 item **各自带完整 metadata** ✅ |
| `list({limit:3})` | len=3 ✅ limit 生效 |

→ 修正 HTTP 层的两处推断：
1. **插件 ctx 的 list 同样是跨目录全库枚举**（不是被 location 绑定收窄）——名册路线在插件侧完全成立；
2. **list item 带 metadata**（HTTP 层初次探测因样本 session 无 metadata 而误判为"被裁掉"，插件侧用**带 metadata 的样本**复核确认）。

## Q8 —— `remove` 会级联删 children ⚠️ 实测确认

```
create(parent) → create({parentID: parent.id}) → child_before = exists
remove(parent)  → parent_removed = true → child_after = missing
```

→ **remove 父 session 会连带删掉子 session**（上游 `packages/core/src/session.ts:397-398` 级联 `store.list({parentID})`）。当前 delegate 建的 session 无 parent，所以安全；但**将来若用 parentID 挂树，remove front session 会连带删后端** → 列入陷阱手册。

---

## 步骤 2 汇总：插件 ctx 直测修正了哪些推断

| # | HTTP 层的说法 | 插件 ctx 直测修正 |
|---|---|---|
| 1 | "list 后必须逐条 get 才能拿 metadata" | ❌ **错**。list item 直接带 metadata（用带 metadata 的样本复核） |
| 2 | "list 返回 {data,cursor} 信封" | ✅ 成立，且插件 ctx **同样是信封不是数组** |
| 3 | "跨目录全库枚举" | ✅ 成立，插件 ctx 内同样成立（23 个目录） |
| 4 | "prompt 默认 steer" | ✅ 成立，插件 ctx 内确认，且 `delivery` 参数直传直生效 |
| 5 | "update 整体替换" | ✅ 成立 |
| 6 | "parentID 继承父 location" | ✅ 成立 |
| 7 | "remove 级联删 children" | ✅ 成立（新增实测证据） |
| 8 | （未覆盖） | ⚠️ **新发现**：`get()` 在 run 未结束/未开始时 **`outcome` 字段整个不存在**，`time` 也无 `busy`/`idle` → 轮询判"还在跑"不能只看 `outcome === null` |

## 仍未覆盖（留待实施期或 ADR 声明）

- 多后端**真并发**（同一 canonical_root 两个工程 session 同时写同一工作树）未实测——上游无互斥机制，冲突风险按 ADR 假设处理。
- worktree 隔离方案（插件自建 `git worktree add`）未实测端到端。
- `ctx.session.wait()` 在 run 中途被 interrupt 时的返回语义未测。
- `ctx.session.list()` 的 `cursor` 在插件 ctx 内跨页续扫未实测（HTTP 层已证无重叠）。

---

# 第三部分：oracle 评审后补跑的探针（round 4–6）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 目的 | 补 oracle 评审指出的 3 个未测前提；**其中 1 条推翻了 oracle 的判断**（它认为缺 running 信号，实际 v2.2.5 有 `time.busy`） |
| 方法 | 同前（临时探针插件，跑完即删 + `opencode service restart`） |

## R4 —— run 进行中的可靠信号 ✅ **推翻 oracle 的"信号缺失"判断**

上游 v2.2.5 的 `Session.Info.time` **有 `busy` 字段**（`packages/schema/src/session.ts:49-50`：「Start of the most recent execution. While it runs, `idle` still holds the previous execution's end.」）—— 2.1.2 快照里没有，v2.2.5 才有。

实测（真实 sleep 8 的 run）：

| 时刻 | `time` 的键 | `busy` | `idle` | `outcome` |
|---|---|---|---|---|
| run 前 | created, updated | null | null | null |
| run 中（t0，prompt 后立即） | created, updated | **null** | null | null |
| run 中（t1，+3s） | created, updated, **busy** | 有值 | null | null |
| run 后 | created, updated, busy, **idle** | 有值 | 有值 | "succeeded" |

→ **running 判据**：`time.busy` 存在 **且**（`time.idle` 未定义 **或** `busy > idle`）。
→ ⚠️ 但有**窗口**：`busy` 在 run 刚开始的一小段时间内**还是 null**（t0 时刻）→ 判据必须容忍"busy 未定义但有未终结活动"的情况，**保守报 running 而非完成**。
→ 这比现有 delegate-core 的「最后消息时间 > 最后 idle」判据**更直接**，且与 `outcome` 字段无关（避免 oracle 指出的「outcome 缺失可能是未开始/进行中/僵尸」三义性）。

## R5 —— 插件 ctx 的可观测面盘点 + cancel 后的队列残留

### 插件 ctx 的 session 方法全集（实测 `Object.keys(ctx.session)`）

```
hook, list, create, get, remove, switchAgent, switchModel, prompt, generate,
command, compact, synthetic, interrupt, update, move, wait, context, instructions
```

→ **没有 `inbox`**。即插件**无法读取 session 的 inbox/队列** → 队列残留只能通过 `ctx.session.context()`（已 promote 的消息）间接观察，**不能直接断言"队列里还挂着什么"**。

### cancel（interrupt）后的行为

```
prompt("sleep 20")           → delivery=steer（默认）
wait_busy                    → busy 有值（1 次轮询即命中）
prompt("队列里的第二条", delivery=queue, resume=false) → delivery=queue
interrupt({resume:false})    → {interrupted:true}, outcome=interrupted, busy+idle 都有值
messages_after_cancel        → 3 条（user / assistant / idle），队列那条**未出现**
resume（再 prompt 一次）      → wait 25s **未 settle**（timed_out），ghost_delivered=false
```

→ 观察到的事实：**队列里那条在 cancel 后没有出现在消息历史里**（未送达）；再次 resume 后 wait 未在 25s 内 settle，**未能观测到 ghost 注入**。
→ 但这是**观测不足**而非**证明不存在**：插件无 `inbox` API（见上），无法确认队列是否仍挂着旧简报；且 resume 后 wait 不 settle 本身就是一个未解释的行为。
→ **处置：ADR 采用"cancel = 墓碑"语义**（该 session 永久不可 resume，再派必须新建）——不依赖未探明的上游清理行为。理由与 oracle 一致：复用价值趋近于零，而幽灵注入的危害是不对称的。

## R6 —— front 自身 session 的 metadata 能否承载 roster ✅ 可行

| 步骤 | 结果 |
|---|---|
| 插件 update 正在运行的 session 的 metadata | ✅ 成功，`{roster:["backend-1","backend-2"], note:"written-by-probe"}` 读回一致 |
| 该 session 经过 host 活动后 | ✅ `roster_survived = true`（metadata 未被宿主覆盖） |
| 跑完一次真实 prompt（outcome=succeeded）后 | ✅ metadata 原样存活（`{roster:["b1","b2"], note:"pre"}`） |
| read-modify-write | ✅ 整体替换语义下自行合并可行（`["b1","b2"]` → `["b1","b2","b3"]`） |

→ **front 自身 session 的 metadata 可以承载 roster 数组**（oracle 的第 8 条建议成立）。

⚠️ **但探针撞到一个陷阱**：在**插件 setup 里对"正在运行的 session"发 prompt** → **挂死**（round 6 的 `after_prompt` 步骤 200s 超时，exit=124）。原因显然是自 prompt 自己 = 死锁。→ **ADR 必须写死：front session 的 prompt 只能由 front 自己发起，插件不得对其发 prompt**；插件对 front session 只做 metadata 的读/写。

⚠️ **另一个陷阱（探针工程侧踩到）**：探针 setup 若**未 settle**，会**阻塞该 location 的激活**（round 4 的 setup 卡在 `ctx.session.wait` → round 5 用同一目录跑时 `opencode run` 直接超时，插件 setup 根本没被调用；换新目录才恢复）。→ **ADR 要求：`dispatch` 的 execute 必须有硬超时**（不能无限等），否则一个挂死的后端会拖住 front 的整个工具调用。

## 第三部分汇总

| # | oracle 的说法 | 探针结论 |
|---|---|---|
| 1 | "run 进行中的可靠信号缺失，D5 建在沙地上" | ❌ **推翻**。v2.2.5 有 `time.busy`，判据 = `busy` 存在且（`idle` 未定义或 `busy>idle`）；唯一缺陷是 run 刚起的窗口期 `busy` 仍为 null → 保守报 running |
| 2 | "插件能否 update 自己 session 的 metadata 未探针" | ✅ **可行**，且 host 活动后不覆盖 → front session metadata 可承载 roster |
| 3 | "interrupt 后 queued prompt 残留行为未探明" | ⚠️ **观测不足**（插件无 inbox API）；观测到未送达，但无法证否 → 采用墓碑语义 |
| 4 | （新发现） | 插件 setup 未 settle 会**阻塞该 location 激活** → dispatch 必须硬超时 |
| 5 | （新发现） | 插件对**正在运行的 session**发 prompt 会**死锁** → 插件不得对 front session 发 prompt |
