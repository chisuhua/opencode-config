# 审稿记录 — 小债清扫：architect 治理面括注 + 三份排障文档的重启口径

> **对象**：`prompts/build.md:454`（architect 行治理面括注）/ `docs/dual-session-delegation.md` §6 / `docs/front-delegate-testing.md` §8 / `docs/front-delegate-usage.md` §10 / `docs/CHANGELOG.md` v2.66
> **触发**：v2.64 / v2.65 审查的遗留（oracle NOTE-1 + 后续债）
> **角色**：builder（主会话）
> **日期**：2026-11-23
> **预算**：oracle 1 轮（`审查域: 治理面`）+ critic 1 轮 ⇒ 均在额度内；无 BLOCKER，无复审

## 0. 结论

| 审查者 | 判定 | 结果 |
|---|---|---|
| oracle（`审查域: 治理面`） | `治理面判定: PASS-WITH-NOTES` | 3 条 NOTE：① `front-delegate-usage` 注记含「/ prompt」与同文档 `:346` 矛盾；② `front-delegate-testing` 结论句过度泛化（prompt 未实证却被否定 restart）；③ 454 行补「门控按 `GOVERNANCE_PATHS` 整文件判定」半句 ⇒ **全部已修** |
| critic（`review_profile: arch`） | `APPROVE` / `mergeable: yes` / `scope_exceeded: false` / **0 BLOCKER** | 0 SHOULD_FIX；1 条 NIT（「范围 = 该列」字面包含 lib/plugins 两行）⇒ **已改为「减去两行」** |

## 1. 改动内容

1. **`prompts/build.md:454`**：architect 行的「编辑治理面文件 `~/.config/opencode/**`」是 `/**` 全根宽泛措辞，v2.64 把 `lib/**` / `plugins/**` 加进审查口径表后可被误读为「architect 可写机制面」。收紧为「范围 = §审查配对 治理面作用域表『算治理面』列**减去** `lib/**` / `plugins/**` 两行；门控按 `GOVERNANCE_PATHS` 整文件判定，该表的段级限定语是审查口径」。
2. **三份排障文档**：各加一条「重启建议的版本口径」注记（源码构建版下插件 / `lib/` 改动热加载、配置 `ConfigWatch` 热加载 ⇒ restart 非必需但仍是兜底）；`front-delegate-testing` 与 `front-delegate-usage` 显式区分 **prompt 未实证**（改 prompt 后仍建议重启 / 换文件名）。不改表格正文。
3. **`docs/CHANGELOG.md` v2.66**。

## 2. oracle 要点与处置

- **口径一致性**：三条注记与 MAD §5.4（`docs/MULTI-AGENT-DESIGN.md:1011`）逐字对齐 —— 只实证插件 / `lib/` / 配置，prompt 不在其内。
- **抓到的新矛盾**：`front-delegate-usage` 注记上一版写「插件 / `lib/` / **prompt** 改动即生效」，与同文档 `:346`「改了 prompt 没变化 → 换文件名或重启」直接矛盾 ⇒ 已删「/ prompt」并显式指向该行。
- **过度泛化**：`front-delegate-testing` 原注记否定整个第 0 步 restart，但 §8 触发清单含「改 `prompts/front.md`」、第 0 步原注自承「prompt 内容被服务缓存」⇒ 已收窄到插件 / 配置。
- **454 行补半句**：避免「散文比门窄」（表有段级限定语、门控按整文件）⇒ 已补「门控按 `GOVERNANCE_PATHS` 整文件判定」。

## 3. critic 要点

- 三个 focus 全部通过：三条注记与 §5.4 一致；454 行与机器门同宽且把写权判定唯一指向机器门；三处（治理面写权 / `arch_paths` 写权 / 审查触发）各管一事、无第二套判据。
- **NIT 处置**：「范围 = 该列」按字面包含 `lib/**` / `plugins/**` 两行 ⇒ 改为「**减去** `lib/**` / `plugins/**` 两行」。
- 验证建议：确认本记录落盘（本文件即为此）；机器门宽度已静态核对（`GOVERNANCE_PATHS` 不含 lib/plugins）。

## 4. 验证

`bun test tests/` = 1115 pass / 1 skip / 0 fail；`scripts/check-upstream-anchors.sh` = 29/29；`bash tests/verify_record_discipline.sh` = OK。
