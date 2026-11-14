# 审稿记录 — verifier 状态收拢 ⇒ 过渡期「主会话代跑」退役

> 批次：`v2.24`（`docs/CHANGELOG.md` v2.24 条目）
> 范围：`prompts/build.md`、`prompts/front.md`、`docs/adr/ADR-class-write-scope-alignment.md`、
> `docs/adr/ADR-backend-handoff-role-class.md`、`lib/delegate-core.ts`、
> `scripts/build_critic_prompt.sh`、`tests/config-guards.test.ts`、`tests/delegate-core.test.ts`、
> `.rddf/improvements/rdd-verifier-state-consolidation.md`
> 治理面判定：`prompts/**` + `docs/adr/**` + 守卫断言增删 + 被治理规则依赖的脚本 ⇒ 属治理面
> ⇒ **oracle → critic 各 1 轮**（顺序不可颠倒）

## 1. oracle（咨询模式）— `BLOCK`

**结论**：`BLOCK`（3 条硬 finding + 3 条中低影响建议 + 4 条已排除的替代方案）。

### 1.1 硬 finding（全部已闭合）

| # | finding | 落点 | 闭合方式 |
|---|---|---|---|
| 1 | **工具 schema 里的旧写集**：`lib/delegate-core.ts` 的 `role_class` 参数描述仍写「verifier=只取证与判决（edit 上限=.rddf/reviews）」—— 那是 **front LLM 在派发瞬间实际读的文本**（它不读 prompt 填表）⇒ 可能据此把 `.rddf/state/verifier` 排除出 scope（**恰好制造新措辞要回收的故障**），且**无任何守卫覆盖** | `lib/delegate-core.ts` | 新增 `verifierAllowRootLabels()`（**由常量派生**）并让 schema 描述用它渲染；**基数也不手抄**（「scope 须覆盖上述全部目录」）；新增守卫（`tests/delegate-core.test.ts`）断言描述必须派生 + 负向锁旧措辞 |
| 2 | **stub 假完成声明**：`.rddf/improvements/rdd-verifier-state-consolidation.md` 的完成记录写「g CHANGELOG v2.24 ✔」，而 `docs/CHANGELOG.md` **无 v2.24** ⇒ 同 v2.22 BLOCK 判例（治理文件预断言未发生事项） | stub + CHANGELOG | 先审后写：critic 结论落定后写真实 v2.24 条目（含真实审查结论）⇒ 声明兑现 |
| 3 | **ADR D1c 正文活矛盾**：Decision 章仍写「不构成义务（后端在过渡期不写它也不违规）」，与现行「**必须**直写（single writer）」直接矛盾 —— 只读 Decision 章的实施方会得出相反结论 | `docs/adr/ADR-class-write-scope-alignment.md` | D1c 加退役注：明确「不构成义务」一句**只描述过渡期、已作废**；「scope 必须同时包含两者」这条约束本身**不变**（理由从「预备」变「必需」） |

### 1.2 中低影响（全部已采纳）

- **静默缺写路径无回收**（后端没写也没 HANDOFF）：`prompts/build.md` 补并列处置（既没被拒也没写 ⇒ 后端违约 ⇒ 按路径查存在性）；`prompts/front.md` §3.3 加 verifier 专用事后核对（gitignore ⇒ `git status` 数不到 ⇒ **按路径查**）。
- `buildBrief` 的 verifier 措辞收紧（状态机由**你**直写）。
- 「该路径已不存在」过于绝对 ⇒ 改「新写入不再发生在根下（存量残留只读不受影响）」。
- 跨会话 resume 查不到原 scope ⇒ 视为缺 ⇒ 重派。
- `model-fallback.json` 的改动与本批无关 ⇒ **不搭本批的车**（保持未暂存，不提交）。

### 1.3 oracle 已排除的替代方案（记入以免复发）

1. **删掉 `VERIFIER_BACKLOG_ROOT_FILES`**（既然已归零）⇒ 否：它是「产品侧又往根下加 verifier 状态文件」的唯一机械探测器，删了等于拆警铃。
2. **把「scope 必须含记账落点」做成插件硬门** ⇒ 否：本地验收路径（三条件未命中）**不写状态机**，强塞 scope 会白授写权限（撞 D2a 最小权限张力）且改变插件契约。
3. **保留「主会话代跑」作为 HANDOFF 后的 fallback** ⇒ 否：loop state 是跨 session 存活的重试计数器，两个写者必漂 3 轮上限；退役的意义就是收回这个网。
4. **直接删除过渡期规则文本**（不划线、不注退役依据）⇒ 否：本仓 v2.23 先例要求「留旧值痕迹 + 日期」可追。

## 2. critic（4 段式）— `APPROVE_WITH_CONDITIONS`

**结论**：`APPROVE_WITH_CONDITIONS`，`mergeable: yes`，`scope_exceeded: false`，**无 BLOCKER**。
5 条 SHOULD_FIX（全部已闭合）+ 3 条 NIT（2 条已承认为枚举式边界，1 条已修）。

| # | SHOULD_FIX | 落点 | 闭合方式 |
|---|---|---|---|
| 1 | 父篇 `ADR-backend-handoff-role-class.md` 的 verifier 写集行仍写「过渡期规则见 D1b」⇒ 把已退役规则呈现为现行；且 AC10 守卫只断言「含 ADR 名」，钉不住这句 | 父篇 | 括注改为「**过渡期规则已退役**（2026-11-14…），见子篇 D1b 退役注」 |
| 2 | 子篇**后果/风险章**仍以现在时描述过渡期（「过渡期实际落盘仍由主会话代跑」「过渡期 verifier 类不能完整跑状态机」「状态机由主会话代跑」）⇒ 可被 agent 捡到的活口径 | 子篇后果/风险章 | 正面项改为「修订前快照」+ 退役注；负面项加删除线 + 「缺口已于 2026-11-14 关闭」；两条风险行标为「过渡期专属，已失效」并给出**退役后的对应风险**与处置 |
| 3 | 子篇 D3-1 / V6 描述的守卫形状（4 项断言**仍不在**允许集内）**已不存在** ⇒ ADR ↔ 守卫方向性漂移 | 子篇 D3-1 / V6 | D3-1 加修订注（第二分句失效、第一分句不变、改为派生视图归零）；V6 标为「已随收拢退役」并写明现行判据 |
| 4 | 工具 schema 描述把允许集**基数手抄为 2**（「须同时含两者」）⇒ 增删一项时会自相矛盾（与本批核心目标自指） | `lib/delegate-core.ts` | 改为「scope 须覆盖上述全部目录」（数量不再出现） |
| 5 | stub 的「g CHANGELOG v2.24 ✔」是伪完成声明 | stub + CHANGELOG | 写真实 v2.24 条目（含真实审查结论）⇒ 兑现 |

### NIT

| # | NIT | 处置 |
|---|---|---|
| 1 | 「工具 schema 必须派生」守卫是**源码文本启发式**（注释里留字符串即可骗过） | 接受为过渡守卫；根治（结构比对）已在 improvement 演进项跟踪 |
| 2 | AC11 的 `toContain("全部")` 平凡可满足；AC8 ③ 的措辞枚举可绕过 | **已改**：AC11 改为「现行行（排除历史注记）不得出现 `.rddf/state/.ac-` + 必须点名『记账落点』」；枚举式边界在 AC14 注释与 improvement 中已显式承认 |
| 3 | `build_critic_prompt.sh`：`--staged` 与 `<ref>` 同传时 stat 与 diff 正文范围仍可能不一致 | **已修**：两者改为**互斥**（直接拒斥 + exit 2） |

## 3. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **533 pass / 0 fail**（8 files） |
| `bash scripts/check-upstream-anchors.sh` | **23/23** |
| 产品侧 pytest unit+integration | **3492 passed / 2 skipped / 0 failed** |
| 产品侧 verifier/archive-gate bats | **43 ok / 0 not ok** |
| 产品侧新增单测 | `test_verifier_state_consolidation.py` **11 passed** |
| 消费侧 e2e CS-6 | **ok**（落盘成功 + 结构化证据无权限拒） |

## 4. 遗留

1. 枚举式词表仍是**开集假设**（AC8/AC11 的措辞可被换写法绕过）—— 根治 = 文档投影 ↔ `VERIFIER_ALLOW_ROOTS` 结构比对（improvement 演进项）。
2. 「工具 schema 派生」守卫是源码文本启发式 —— 过渡守卫。
3. `VERIFIER_OWNS_PATHS` ↔ skill `owns:` 同步仍**人工**（skill 在仓外）—— 派生视图只能发现「新增根下状态文件」。
4. 产品侧 change `consolidate-verifier-state` 尚未 archive（待其仓 `./test.sh --full --regression`）。
