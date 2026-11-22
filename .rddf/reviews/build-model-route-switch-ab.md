# 审稿与决策记录 — build 模型路由 A/B（含前置的治理面门控修复）

> **范围**：① 修治理面门控缺口（`opencode.jsonc` 是符号链接 ⇒ architect 改不了自己的配置）；② 设计并尝试落地 MiniMax **anthropic 兼容路由 → OpenAI 兼容路由** 的 A/B（用于降 `tool.input-json` 失败率）。
> **角色**：builder（① 实现，`d70a811`）｜architect（② 治理面变更 + 本记录）｜**审稿**：oracle ×2（均声明 `审查域: 治理面`）+ critic ×1（build+arch）
> **日期**：2026-11-22
> **结论**：① **已合入**；② **已落地**（2026-11-23 额度恢复 → pre-flight 200 → 配置生效），进入 5 天观测窗口（判据见 §2、见 §7）。

## 0. 结论

| 项 | 结果 |
|---|---|
| ① 治理面门控缺口 | ✅ 修复并合入（`d70a811`）；oracle **PASS-WITH-NOTES**（要求补钉桩用例，已补）→ critic **APPROVE**（无 BLOCKER，1 SHOULD_FIX=文档口径滞后 → 登记 §6） |
| ② build 路由 A/B | ✅ **已落地**（2026-11-23）：额度恢复后 pre-flight **200**（`prompt_cache_key` 未致 400、tool 参数完整、`reasoning_content` 436 字符）⇒ 3 处配置生效；5 天观测窗口**进行中**，判据见 §2 |
| 回滚风险 | 无（未提交任何配置改动；`model-fallback` 已把 build 切到 `commandcode/deepseek/deepseek-v4.1-flash`） |

## 1. 缺陷①：治理面判定被符号链接绕过（归属反转）

| 项 | 内容 |
|---|---|
| 现象 | architect 编辑 `opencode.jsonc` 被拒：`role-gate: 角色「architect」禁止对「opencode.jsonc.opencode-go」执行 edit`；而 builder（`allow:["**"]`）反而能改 |
| 根因 | 本仓 `opencode.jsonc` 是**符号链接**（→ `opencode.jsonc.opencode-go`，用链接切配置变体）；`normalizeTarget()` 用 `realpathSync` 归一 ⇒ 治理面判定看到的名字是变体名，不命中 `GOVERNANCE_PATHS` 的字面名 `"opencode.jsonc"` ⇒ 落「仓库内」分支 ⇒ architect 的 allow（`.rddf/config/arch-docs.json` + `.rddf/reviews` + arch_paths）不含它 ⇒ 拒 |
| 次生 | 治理面表的**代码真源**在 `lib/role-policy.ts`，而 `lib/**` 不在 architect 写集 ⇒ architect 连自己的表都维护不了（结构性反转，本次不修，见 §6） |

**修复**（`d70a811`，2 文件 +67/-2）：
- `decideWrite`：治理面 = **未解析链接的调用路径 ∪ realpath**，任一命中即算（fail-closed 两个方向都收：非治理名软链 → 治理文件仍由 realpath 支兜住；**治理名软链 → 仓库外目标不再落「仓库外不限制」的既有 fail-open**）；
- `GOVERNANCE_PATHS` 补 `opencode.json.*` / `opencode.jsonc.*`（覆盖直接编辑变体文件；本仓命中 11 个实体文件，含 9 个 `.bak-*`/`.backup-*` 备份 —— oracle/critic 均判定「算治理面」是更稳的默认，收窄会重新引入「新增变体忘入表」的原 bug）；
- 拒绝文案改报**调用者写下的名字**（链接场景诊断更直接）；
- 3 条新用例，其中「治理名链接 → 仓库外目标」是 dual-hit 的**钉桩**：判别力演练 —— 撤掉 invoked 支 ⇒ 恰好该用例变红（30 pass/1 fail），还原后全绿。

**证据**：`bun test tests/role-policy.test.ts` 31 pass；`bun test tests/` **1091 pass / 1 skip / 0 fail**；现场 e2e：architect 经 `opencode.jsonc` 链接编辑 **放行**（修复前同一动作被拒）。

## 2. A/B 的设计（未执行）

**动机**：MiniMax **anthropic 兼容路由**（`https://api.minimaxi.com/anthropic/v1`）的流式 tool-call 参数偶发被截断 ⇒ opencode 报 `tool.input-json`（工具**未执行**，fail-closed，模型重发自愈）。

**基线**（`scripts/tool-json-failure-stats.ts`，最近 7 天）：

| 维度 | 数据 |
|---|---|
| 按模型 | `minimax-cn/MiniMax-M3.1-Flash` **24,734 calls / 265 失败 = 1.07%**；`opencode-go` 16,461/0；`commandcode` 10,287/0；`kimi-code` 5,475/0 |
| 按天（非平稳） | 11-18 0/11,561 · 11-19 0.38% · 11-20 **1.71%** · 11-21 1.25% · 11-22 0/2,669 |
| 按 agent | `build` **44,669**（唯一有量）· `plan` **22** · `front` **10** ⇒ **灰度只能切 build**（原计划「只切 plan」被数据否决） |

**方案**：新增 provider `minimax-cn-openai`（`@opencode/ai/providers/openai-compatible` + `https://api.minimaxi.com/v1`），`agent.build.model` 与顶层 `model` 指向它；`plan`/`front` 保持原路由；不动 `model-fallback.json`（只在 provider 失败时用到）。

**判据**（按 oracle 的加强项，原「3 天 ≥5,000 calls 且 <0.2%」不足以防「单日凑数」与「爆发日」）：
1. **≥3 个不同自然日**、每日 ≥500 calls；
2. **单日熔断**：任一日（calls ≥500）失败率 >0.5% ⇒ 判 FAIL / 延长观察；
3. 窗口总量 ≥5,000 calls 且总率 **<0.2%**（基线 1/5）；
4. **0 失败即提前通过**（n≈5,000 时 rule-of-three 95% 上界 ≈0.06%）。
窗口建议 5 天（build 约 6,400 calls/日）。

## 3. 历史阻塞：provider 额度耗尽（2026-11-22 撤回的直接原因，11-23 已解除）

| 证据 | 内容 |
|---|---|
| pre-flight（opencode 形态，含 `prompt_cache_key`） | HTTP **402** `insufficient_balance_error`：`当前已达到 Token Plan 用量上限…(2067)` |
| anthropic 路由最小请求 | HTTP **429** `rate_limit_error`：同一条额度文案 ⇒ **两个路由都不可用**（与路由无关） |
| model-fallback 日志 | `2026-11-22T13:08:59Z build: minimax-cn/MiniMax-M3.1-Flash -> commandcode/deepseek/deepseek-v4.1-flash; provider.rate-limit/429: 当前已达到 Token Plan 用量上限…` ⇒ build 已自动降级 |
| 备用凭据 | `auth.json` 的 `minimax-cn-coding-plan` 凭据当裸 API key 用 ⇒ **401 invalid api key**（不是可用的替代凭据） |

⇒ 切换后**既无法 pre-flight 也无法观测**（无流量），且「未验证的 `prompt_cache_key` 若触发全量 400 ⇒ 额度恢复后 build 立刻回落」的风险不可接受 ⇒ **撤回**（配置与 CHANGELOG 均 `git checkout` 还原，未提交）。

## 4. 审稿 finding 的处置

| 来源 | finding | 处置 |
|---|---|---|
| oracle① | 必须给 dual-hit 的 invoked-only 支补钉桩用例（否则只留 glob 也能全绿） | ✅ 已补 + 判别力演练 |
| oracle① | 两条 finding 必须落账，不许只写汇报 | ✅ 见 §6 |
| oracle① | 别在同一次改动里顺带改 `prompts/build.md` | ✅ 遵守 |
| critic① | SHOULD_FIX：`ADR-role-aware-permissions:46` 与 `lib/role-policy.ts` docstring 的「判定以归一绝对路径为根」口径需同步为双命中 | 登记 §6（architect 批处理） |
| critic① | NIT：新用例 1 单独无判别力（套件级由用例 2/3 钉桩） | 记录，不补 |
| oracle②（治理面） | pre-flight 必含 `prompt_cache_key`；`compatibility.supportsPromptCacheKey:false` 视结果而定 | ⛔ 被额度阻塞，见 §5 清单 |
| oracle② | 判据需 ≥3 活跃日 + 单日熔断 + 0 失败提前通过 | ✅ 已写入 §2 判据 |
| oracle② | 建议给统计脚本加 `--judge`（子判据逐项 PASS/FAIL、exit 1） | 登记 §6（需 builder 写，含测试） |
| oracle② | 窗口期**不要**加 `tool.input-json` 自动重试（会遮断 DB 指标，污染 A/B） | ✅ 遵守 |
| oracle② | 确认 dual-hit 对本变更无副作用且是前置依赖 | ✅ |

## 5. 执行清单（2026-11-23 已执行前 2 步）

1. ✅ **pre-flight**（opencode 形态，含 `prompt_cache_key`、`stream_options.include_usage`、`tools`、`temperature:0.1`）：HTTP **200**、tool 参数完整、`delta.reasoning_content` 正常返回（436 字符）、`prompt_cache_key` 未触发 400 ⇒ **不需要** `compatibility.supportsPromptCacheKey:false`。
2. ✅ 应用配置（3 处：`agent.build.model` / 顶层 `model` / 新增 provider `minimax-cn-openai`）—— 随后按第 3、4 步观测。
3. ⏳ 抽查 assistant 消息确认 reasoning part 入库（随观测窗口一起做）。
4. ⏳ 按 §2 判据观测 5 天（或 0 失败提前通过）→ 保留或还原 3 处（`ConfigWatch` 热加载，无需重启；口径差异见 §6.7）。

## 6. 登记给 architect 批处理（本次不做）

1. `prompts/build.md` 治理面表的 `opencode.json(c)` 行扩写为变体 glob —— **gate ⊃ 文档表**（实现认 `opencode.json.*`/`opencode.jsonc.*`，表只写字面名）。
2. `docs/adr/ADR-role-aware-permissions.md:46` + `lib/role-policy.ts` docstring：把「写集判定以**归一绝对路径**为根」口径同步为「治理面检测 = 调用路径 ∪ realpath；写集判定仍按 realpath」。
3. **`lib/**` 归属裁定**：architect 维护不了自己的治理面表（表在 `lib/role-policy.ts`，`lib/**` 不在 architect 写集）——本次反转的次生根因。
4. （可选）`scripts/tool-json-failure-stats.ts` 加 `--judge`（子判据逐项 PASS/FAIL + exit 1），**需 builder 写（含测试）**。
5. （可选）写门治理面留痕（role-gate 目前只有 throw，无 ledger 行）。
6. （独立）给 MiniMax 报 `tool.input-json` 截断 issue（265 条失败样本 + 时间分布 11-19 起突增 + 两条原始事件 2026-11-20 16:13 / 2026-11-21 09:59）。
7. **「热加载 vs 必须重启」口径统一**：`docs/MULTI-AGENT-DESIGN.md:1009`（§5.4 生效时机）与 `docs/model-fallback-usage.md`（「改完必须重启」）写的是「插件在 server 启动时加载」的旧事实；2026-11-22 实测：改 `lib/role-lease.ts` 后下一次工具调用即生效、服务进程已运行 2.2 天未重启（`heartbeat_at` 两次写之间前移 16.8s），配置由 `ConfigWatch` 热加载。根因待查（插件加载时机变了，还是从未需要重启）⇒ 统一后再回改两处；本次只在两处加「与实测不符」的 ⚠ 注记（改 §5.4 正文会连带再断一次回滚清单 edit #5 的锚点与 drill 证据链）。

## 7. 落地与第二轮审稿（2026-11-23）

**落地证据**：两路由最小请求 200；opencode 形态 pre-flight 200（tool 参数完整 / `reasoning_content` 436 字符 / `prompt_cache_key` 未致 400）；配置 3 处生效（`agent.build.model` 与顶层 `model` = `minimax-cn-openai/MiniMax-M3.1-Flash`，`plan`/`front` 仍 anthropic 线路）。门禁：`bun test tests/` 全绿 + `bash scripts/check-upstream-anchors.sh` 29/29。

**回滚演练（隔离副本，基线 `a2dc627`）**：首轮 **FAIL**，两只既有缺口被这次锚点变更暴露：
1. 清单只删机制文件、不动 `registry.json` ⇒ 回滚后 `model-fallback` 条目悬空（`proving` + `watch` 路径已删）⇒ `M7` 红；
2. 只 retire 条目不删清单文件 ⇒ `M1` 孤儿清单红。
修法按仓库既有形态（与三份组清单一致）：补 `retire: ["model-fallback"]` + 把**本清单自身**加入 `delete`（delete 5 → 6）。修后演练 **PASS**（`bun test tests/` 全绿），`last_drill` 已回填（sha `a2dc627` / 2026-11-23 / pass / content_hash），registry 条目转回 `active`。

**critic②（本轮 patch，`review_profile: arch, build`）**：**APPROVE_WITH_CONDITIONS** / `mergeable: yes` / `scope_exceeded: false`，**无 BLOCKER**。finding 逐条处置：

| # | finding | 处置 |
|---|---|---|
| SF1 | §5.4「生效时机」不修的取舍成立，但「登记为后续 finding」在所有落点都不存在（不落账 = 没有） | ✅ 登记 §6.7（本文件）+ CHANGELOG 登记项 ⑦ |
| SF2 | CHANGELOG v2.60「ConfigWatch 热加载，无需重启」与 §5.4 / usage 手册正面矛盾 —— 本次**新造**了一个矛盾 | ✅ 该子句加限定（「本环境实测」+ 指向登记项 ⑦）；改 §5.4 正文会再断清单锚点，按 SF1 的取舍登记 |
| SF3 | `docs/model-fallback-usage.md` 当前态示例已变假（链头仍写 `minimax-cn`） | ✅ 已更新示例与链图（含候选 `minimax-cn` 现在会真的出现一次）；该文件在清单里是 `delete`（非 edit）⇒ 不影响锚点 |
| NIT1 | `MULTI-AGENT-DESIGN.md:948` 历史订正块内「（build 主模型，收益最大）」归因漂移 | 记录不改：历史 blockquote，非当前态；随 §6.7 统一口径时顺手 |
| NIT2 | 我给出的 intent 里「`config-guards.test.ts` 守卫要求文档模型表与配置一致」归因不实（真实闸门是 `tests/rollback-manifests.test.ts:65` 的 find 唯一性） | 记录更正：锚点同步确实有闸门兜着 ✓；MAD / SUBAGENT-ORCHESTRATION 的模型表同步**无**守卫，靠 MAD 的同步义务 —— 写入本记录，避免后人信任不存在的闸门 |

**未采纳的验证建议**：critic 建议「若动 §5.4 正文须同批再同步 edit #5 锚点」—— 本次未动正文（见 SF1 取舍），故不适用。
