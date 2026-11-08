# proposal: front-knowledge-capability

## 背景

两篇 Accepted ADR 描述的是一批**已交付**的改动（代码/配置/测试均已入库），但从未立项，因此没有可被 verifier 逐条对照的 AC：

- `docs/adr/ADR-front-knowledge-capability.md`（Accepted）—— front 获得知识获取能力（只读 subagent + 知识 session + 记忆层）。
- `docs/adr/ADR-delegate-delivery-evidence.md`（Accepted）—— 交付面证据与 `outcome="unverified"`。

本 change 的唯一目的是**把这批已交付行为固化为可验收的 AC**，让 verifier 能逐条判定——不是重新实现。

## 目标

1. 把两篇 ADR 的 Verification（18 + 8 条）收敛为统一 AC 编号，并给出**可逆的映射表**（ADR 条目 ↔ AC），供 ADR 元数据回填。
2. 每条 AC 标明**最低可接受证据**与可直接复制的**证据命令**。
3. 明确 Out of Scope 与"Notes to verifier"（已披露残留），避免把有意取舍判成失败。

## 证据规则（先于 AC 生效）

1. **E2E 默认全 skip**（`E2E_REAL_RUNTIME` 未设置时 bats 退出码 0）。**skip ≠ pass**：E2E 未实际执行时，该 AC 判**不可判定**，禁止判通过；须改用该 AC 的"降级证据"。
2. **E2E 证据在外部仓库**：`/workspace/main/rdd-workflow-e2e`，文件 `tests/integration/test_front_delegate_runtime.bats`（入库 commit `87c8919`；首次入库 `25ea0f2`）。本仓库 verifier 以**该仓库的 commit SHA + 运行日志**为证据锚点，不要求跨仓重跑。
3. **证据类型只有三种**：`单测`（`bun test tests/`）、`E2E`（上述 bats，需真实模型）、`静态`（配置/`debug agents`/`git show`/`grep`）。**不设"人工"类型**——verifier 契约要求每条判据至少 1 条工具证据。
4. **E2E 运行命令**（真实模型 + 可用 provider）：
   ```bash
   cd /workspace/main/rdd-workflow-e2e
   E2E_REAL_RUNTIME=1 L2_FRONT_MODEL=commandcode/deepseek/deepseek-v4.1-flash \
     L2_BUILD_MODEL=commandcode/deepseek/deepseek-v4.1-flash \
     bats tests/integration/test_front_delegate_runtime.bats
   ```
5. **`opencode debug agents` 首跑可能非 JSON**（location 激活竞争）：重试 ≤3 次或截取首个 `[` 到末尾 `]`。

## 验收标准

### A. front 的只读 subagent 放行与加固

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC1** | front 的 `subagent` 规则恰好 5 条 allow（explore/librarian/oracle/metis/critic）+ 1 条 `"*": "deny"`，且 **`deny` 是第一条**、末条为具体 agent | 静态：`python3` 解析 `opencode.jsonc` → `front.permission.subagent`；`opencode debug agents` 复核顺序 |
| **AC2** | front 调 `subagent(agent="general")` 被**权限层**拒（`error` + `Permission denied`） | E2E L2-15；降级：静态（规则集合中 general 无 allow） |
| **AC3** | `plan` / `build` 不在 front 的 subagent allow 集合内 | 静态：同上（AC1 的规则集合） |
| **AC4** | front 召 explore 时，explore 的 `bash -c …` / `tee` / `sort a > b` 被权限层拒 | E2E L2-12；降级：静态（explore 的 shell 首条 deny + 守卫在 allow 之后） |
| **AC5** | librarian 的 `subagent` 为 `deny`（深度 2 链关闭） | 静态：`opencode.jsonc` + `debug agents` |
| **AC6** | librarian 网络写守卫：`curl -o /tmp/x URL`、`wget -O /tmp/x URL` 被拒；`git clone URL /tmp/opencode/repo` 放行；`git clone URL /etc/x` 被拒 | E2E L2-13；降级：静态（规则索引顺序） |
| **AC7** | 五个 agent 的 shell 守卫含**首参形态**：curl（`-o*`/`--output*`/`-O*`/`-T *`/`--upload-file *`/`-d @*`/`--data @*`/`--data-binary @*`）、wget（`-O*`/`--output-document*`/`-P*`）、git（`--output*`/`--format*`/`--pretty*`）、sort/uniq（`-o*`） | 静态：解析五个 agent 的 `permission.shell` 键集合 |

### B. delegate 契约与登记

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC8** | `delegate(agent="general"｜"plan")` 在**建 session 前**被拒（无 `session_id`、无 pair 新增） | 单测 `delegate-tool.test.ts`（非白名单 agent 用例）；E2E L2-9 |
| **AC9** | resume 一个已登记但 `agent` 不在白名单的 session 被拒 | 单测 `delegate-tool.test.ts`（resume 白名单用例） |
| **AC10** | resume 时显式 agent 与登记 agent 不一致被拒（**扩展自 D4/H1b，非 Verification 原文**） | 单测 `delegate-tool.test.ts`（agent 不匹配用例） |
| **AC11** | resume 时 `canonical_root` 不匹配被拒 | 单测 `delegate-tool.test.ts`（canonical_root 用例） |
| **AC12** | knowledge session：`grants` 非空被拒；`scope` 为空/缺省不报错且不注入 edit allow | 单测 `delegate-tool.test.ts`（知识 grants / 空 scope 用例）；E2E L2-10 |
| **AC13** | `delegate(agent="explore", scope=["src"])` 后该 session 的 edit 规则恰为单条 `*: deny` | 单测 `delegate-tool.test.ts`（非空 scope 用例） |
| **AC14** | knowledge 登记：`role.json` 的 `sessions` 不新增条目；`pair.json` 该条 `kind="knowledge"` | 单测（core + tool）；E2E L2-10 |
| **AC15** | resume 合法性只由 `pair.json` 判定（`lookupPair` 只读 pair；ledger 缺失/伪造不影响 resume） | 静态：`lib/delegate-core.ts::lookupPair`；单测（未登记 id 被拒） |

### C. 记忆层（ledger）

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC16** | 行时机：校验失败/resume 失败不落行；busy 落一行；正常结束/超时各落一行；单次不产生两行 | 单测（正常/busy/校验失败三用例）；E2E L2-11 |
| **AC17** | 字段齐全（12 项：`recorded_at`/`kind`/`front_session_id`/`backend_session_id`/`goal`/`scope`/`outcome`/`host_outcome`/`blocked_reason`/`out_of_scope_files`/`changed_files`/`last_assistant_text`）；`last_assistant_text` 已截断且脱敏（`oc_sk_`/`sk-`/`ghp_`/`AKIA`/`Bearer` 族） | 单测（ledger 字段 + `redactAndTruncate`）；E2E L2-11 |
| **AC18** | ledger 与 pair/role 写入同一临界区：**同进程**并发两次委托，pair/role/ledger 三项均无丢失（注明：跨进程 flock 竞争未覆盖） | 单测（并发用例） |

### D. 消防态与生效

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC19** | 配置与代码在**同一 commit**（commit `<SHA>` 的 `git show --stat` 同时含 `opencode.jsonc` 与 `lib/delegate-core.ts`）。注：不主张"历史任一时刻" | 静态：`git show --stat <SHA>` |
| **AC20** | `opencode reload` 后 `debug agents` 仍为"首条 `* deny` + 五 allow"（不因 reload 变形） | 静态：`opencode reload` + `debug agents` |

### E. 交付面证据与 `unverified`

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC21** | 真实失败会话夹具回放 → `outcome="unverified"`、`host_outcome="succeeded"`、`no_work_evidence=true` | 单测（`tests/fixtures/real-no-work-session.json`） |
| **AC22** | 正常交付（有写盘调用或产物）→ `outcome="succeeded"`、`host_outcome="succeeded"`、`no_work_evidence=false` | 单测；E2E L2-3 |
| **AC23** | 知识 session 即使零工具调用也不得判 `unverified` | 单测；E2E L2-10 |
| **AC24** | resume 历史含写盘调用、本轮仅开场白 → 仍判 `unverified`（本轮窗口生效） | 单测（resume 时间窗用例） |
| **AC25** | `still_running`（wait 超时 / 宿主无 outcome）→ **不**判 `unverified` | 单测（wait 超时用例） |
| **AC26** | 无新活动时 `unknown` **优先于** `unverified` | 单测（unknown 用例） |
| **AC27** | `model_switched` 作为根因信号：最终文本非开场白 + 无写盘无产物 → 仍判 `unverified` | 单测（model-switched 用例） |
| **AC28** | ledger 行同时记录 `outcome` 与 `host_outcome`（`unverified` 时后者为 `succeeded`） | 单测（ledger 断言） |
| **AC29** | front 的 outcome 枚举表包含 `unverified` 且写明"不得当完成"；§五 禁止事项与 §六 排障表同步 | 静态：`grep -n unverified prompts/front.md` + 人工读取上下文（工具证据为 grep 命中 + 周边行） |
| **AC30** | 迁移清单 8 项**同 patch** 完成：`git show --stat <SHA>` 含实现 + 5 份文档 + prompt + 测试；CHANGELOG 以**增补记录**校正旧句（不篡改历史） | 静态：`git show --stat <SHA>` + `grep -n "v2.6 增补" docs/CHANGELOG.md` |

### F. 信任定级（ADR-front D7）

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC31** | `prompts/front.md` 写明：引用 ledger 须出示 `recorded_at`；引用 subagent 综述须标注来源；不得把综述当已批授权（`grants` 仍须问用户） | 静态：`grep -n "recorded_at\|已批授权\|标注来源" prompts/front.md` |

## AC ↔ ADR Verification 映射

| ADR-front-knowledge-capability Verification | AC |
|---|---|
| 1（front 可调五 / 其余拒） | AC1（规则）+ AC2（general 实测）+ AC3（plan/build 静态） |
| 2（加固证据） | AC4 |
| 3（librarian 深度 2） | AC5 |
| 4（网络写守卫） | AC6 |
| 5（delegate 白名单） | AC8 |
| 6（resume 白名单） | AC9（+ AC11 的 canonical_root 为扩展） |
| 7（knowledge grants/scope） | AC12 |
| 8（explore scope 无 edit） | AC13 |
| 9（knowledge 登记） | AC14 |
| 10（ledger 行时机/字段） | AC16（时机）+ AC17（字段） |
| 11（并发同临界区） | AC18 |
| 12（resume 只由 pair） | AC15 |
| 13（**D7 信任定级**） | **AC31**（原 proposal 漏映射，已补） |
| 14（消防态） | AC19（锚定 commit） |
| 15（reload + 规则形状） | AC20 |
| 16（D2.1 顺序 + 可见 + 召 general 拒） | AC1（顺序）+ AC2（实测） |
| 17（D3.1 首参形态） | AC7 |
| 18（**已知残留声明**） | **Note N2**（原 proposal 漏映射，已补） |

| ADR-delegate-delivery-evidence Verification | AC |
|---|---|
| 1（unverified + host_outcome + no_work_evidence） | AC21 |
| 2（正常 → succeeded） | AC22 |
| 3（knowledge 不判 unverified） | AC23 |
| 4（resume 时间窗） | AC24 |
| 5（still_running 不判） | AC25 |
| 6（ledger outcome/host_outcome + front 枚举） | AC28 + AC29 |
| 7（迁移 8 项同 patch） | AC30 |
| 8（**已知误报形态文档化**） | **Note N1**（原 proposal 误写成 AC26，已移出） |

> 扩展项（非 Verification 原文）：**AC10**（resume agent 不一致）、**AC11**（canonical_root）、**AC26**（unknown 优先）、**AC27**（model_switched 信号）、**AC31**（D7）。

## Notes to verifier（不参与通过/失败判定）

- **N1 已知误报形态**：shell 写 git 可见之外的文件（`.gitignore` 内 / 工程根外 / worktree 内）+ 开场白收尾 → 会被判 `unverified`。这是 D2 口径失真的**有意边界**，在 ADR 风险章 + Verification 判例中有文档记录；**不得**因此判 AC21/AC22 失败。
- **N2 已知残留**：短选项组合（`curl -so …`、`curl -sO …`）与配置化输入（`curl -K -` / `--config`）不被守卫覆盖，只靠 librarian prompt 约束（ADR D3.1「已知不可完备面」）。**不得**要求 AC7 覆盖它们。
- **N3 环境依赖**：E2E 需真实模型与可用 provider；额度不足时用 AC 的降级证据（静态/单测），并把"E2E 不可执行"如实记录，不判失败也不判通过。

## Out of Scope

1. **并行 / 异步委托**（一次派多个后端 session）—— 后置。
2. **项目 wiki** —— 后置，先用 ledger 一个月（ADR-front D6）。
3. **常驻知识 session** —— 否决（与 plan 重叠）。
4. **`general` / `context-builder` 的 shell 加固** —— front 不可达，后置。
5. **跨进程 flock 竞争** —— 本次只覆盖同进程并发（AC18 已注明）。

## 风险

- **证据类型不均**：AC2/AC4/AC6/AC22/AC23 的运行时部分依赖 E2E；无 provider 时降级为静态/单测，验收强度下降（已由"证据规则 1/3"约束，不允许 skip 当 pass）。
- **AC29/AC31 是文本断言**：只能证明 prompt 含相应措辞，不能证明模型行为；但它们是"权限层之外唯一防线"的**存在性**检查，作为 AC 是合适的（行为层由 D7 的设计承认无法机检）。
- **AC19/AC30 锚定具体 SHA**：若历史被 squash/rebase，需重取 SHA 并更新本 proposal。
