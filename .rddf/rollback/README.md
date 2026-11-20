# `.rddf/rollback/` —— 机制退役的回滚清单

每个文件 = **一个机制**的「退役脚本」：`delete`（要删的文件）+ `edits`（逐段改回原措辞）。
由 `scripts/rollback-drill.ts` 在**隔离 clone** 里执行，再跑清单声明的验证命令。

## 用法

```bash
# 只检查清单在当前内容上是否可执行（find 恰好 1 次 / delete 目标存在 / 不同路径重叠）
bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json --dry-run

# 真演练：clone → 应用清单 → 跑验证命令（默认 `bun test tests/`）
bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json

# 保留副本取证（打印路径）
bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json --keep
```

退出码：`0` 通过 / `1` 失败（清单漂移或验证红）/ `2` 跳过（非 git 仓、clone 失败、嵌套调用）。

## 清单格式

```jsonc
{
  "version": 1,
  "mechanism": "commit-gate",          // 与文件名一致
  "adr": "docs/adr/….md",              // 决策真源（人读）
  "notes": "覆盖面 + 保留项 + 为什么",  // 人读；drill 不解析
  "delete": ["plugins/x.ts"],           // 仓库内相对路径；目标必须存在
  "edits": [{ "path": "prompts/x.md", "find": "…", "replace": "…" }],
  "drill_env": {                        // 演练环境准备（不属于回滚步骤）
    "seed_files": [{ "path": ".rddf/state/role.json", "content": "…" }]
  },
  "verify": { "commands": [["bun", "test", "tests/"]] }
}
```

**判据（fail-closed，实现在 `lib/rollback-drill.ts`）**

- schema 非法 ⇒ 拒；
- `delete` 目标**必须存在**（不存在 ⇒ 清单已漂移）；
- `edits.find` 在**运行中的内容**里必须**恰好出现 1 次**（0 次 = 已漂移；≥2 次 = 无从确定改哪处）⇒ 清单与代码**同漂**，措辞一改就红，不会静默变 no-op；
- `delete` 与 `edits` **不得指向同一路径**（判同键 = `path.posix.normalize`，`./a.txt` 与 `a.txt` 视为同一路径）；
- **不做部分应用**：先全内存模拟（同一个文件的多条 edits 按声明顺序作用在运行中的内容上），全过才落盘。

**安全**：只在 `mkdtempSync(tmpdir())` 下的 clone 里动手（断言副本路径 ≠ 真仓）；验证命令带 `ROLLBACK_DRILL_CHILD=1`，嵌套调用默认拒绝。

**drill 基于 HEAD**：`git clone` 只含**已提交**内容 ⇒ 未提交改动不参与。改完清单要**先提交**再跑，否则测的是旧 HEAD。

## 与默认套件的关系（零成本漂移守卫）

`bun test tests/` 里有一条 `tests/rollback-manifests.test.ts`：用**同一个判据**（`planDrill`）在**当前工作树**上做内存校验（毫秒级、零写盘）—— `delete` 目标存在 / `find` 恰好 1 次 / 无路径重叠 / `mechanism` 与文件名一致 / `adr` 存在 / `verify` 非空。

⇒ 任何改动让某条清单漂移，**本次 `bun test` 立刻红**，不必等有人想起来跑 drill。

⚠ 它在 drill 的副本里**跳过**（`ROLLBACK_DRILL_CHILD=1`）：副本正是「清单已执行完」的状态，`find` 必然不再匹配 ⇒ 在那里跑会恒红。**真演练**（clone + 跑验证命令，≈30s/清单）仍按需手动执行 —— 本守卫证明「清单**现在**可执行」，drill 证明「执行后**仓库仍自洽**」，两者不能互替。

## 现有清单

| 清单 | 机制 | 规模 | 实测 |
|---|---|---|---|
| `commit-gate.json` | commit 工具层验证门（`ADR-commit-verification-gate`） | delete 9 + edits 29 | `809 pass / 0 fail`（隔离副本） |
| `plan-topics.json` | plan 侧多会话协作：`plan-worker` + topic checker（`ADR-plan-multi-session-collaboration`） | delete 4 + edits 14 | `983 pass / 0 fail`（隔离副本） |

## 保留项（实测得出，不是偏好）

回滚**退役的是机制**，不是决策记录本身 —— ADR / CHANGELOG / 评审报告一律保留。除此之外，以下**必须保留**，否则套件红：

- `tests/commit-gate-d9-registration.test.ts`（commit-gate 的 V10 载体）与 `.rddf/commit-gate.json`（门禁声明）—— 各有守卫断言其存在；
- `docs/MULTI-AGENT-DESIGN.md` 的 §2.8.8（D9 索引段）与 §3.4 的 **D9⑯ 指针行** —— 载体用例以「索引段之外仍提到 D9⑯」为前提。
- `.rddf/plan-topics/**` / `.rddf/state/plan-sessions.json`（plan-topics）—— 已落盘的协作文档是版本化产物，退役后停止写入即可。

## 哪些机制适合做清单（边界）

清单擅长**增量机制**：一组自包含文件 + 可逐段回退的措辞投影。

不适合的是**骨架机制**（改它等于改产品形态）：`role-gate`（`lib/role-*` 1055 行 + 9 个测试文件 + `prompts/build.md` 的整个角色矩阵）与 `delegate`（`lib/delegate-*` 5261 行 + 约 5900 行测试 + 13 份文档）。它们的「回滚」不是删文件 + 改措辞，而是**代码级回退**（例：撤回 `sessions` 的 owner 过滤会连带改 `lib/delegate-core.ts` 的多处判定并使大批用例失去断言对象）⇒ 属重构，不属清单能力范围。真要退役其中某个**增量**（如 `ADR-plan-delegate-engineering-session` 的三步、或 `role_class` 的校验增量），应另立清单并承担上述风险。
