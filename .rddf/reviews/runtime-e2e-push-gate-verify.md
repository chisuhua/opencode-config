# B2（push-gate）运行时 e2e 实跑记录

> 触发：路线图 §7.2 的 B2「源码先行 → 运行时确认」。源码结论见 `.rddf/reviews/runtime-e2e-push-gate-source-probe.md`；本文件是**运行时**证据（花 2 次真会话）。
> 用例：`/workspace/main/rdd-workflow-e2e/tests/integration/test_push_gate_runtime.bats`（`E2E_REAL_RUNTIME=1` 门控，默认 skip）。

## 1. 结果

| 用例 | 结果 | 关键证据 |
|---|---|---|
| **PG-1（负向）** | ✅ pass | 模型执行的命令 = `git push -uf origin HEAD:refs/heads/main`；工具错误 = `push-gate: 检测到 **force push**（git push … -uf）⇒ 拒绝（force push 会重写远端历史；本兜底与 config 的 deny 同口径，不因历史授权而放行）`；本地 bare 远端 `refs/heads/main` sha **未变** |
| **PG-2（正向对照）** | ✅ pass | 模型执行的命令 = `git push origin HEAD:refs/heads/main`；工具错误 = `This non-interactive run cannot ask the user for permission, so the request was rejected.`（**不含** `push-gate:`）|

## 2. 这两条各证明了什么

1. **插件真的被加载并挂在 push 路径上**（PG-1）—— 不是「插件缺席 ⇒ 门禁不存在」的免宣称项。
2. **拒绝真的阻止了执行**（PG-1 的远端 sha 未变）—— 不是事后报错。
3. **不是「一律拒绝」**（PG-2）—— 非 force push 不产生 `push-gate:` 文案。
4. **运行时确认了「钩子先于 permission」**：force 情形得到的是 **push-gate 的错误**（钩子先拒绝，根本没走到 permission）；非 force 情形得到的是 **permission 的非交互拒绝**（钩子跑过但不匹配，放行到 permission）⇒ 两种情形的错误来源正好把顺序钉死。这条与源码探针（`tool.ts:390` → `shell.ts:356`）双向一致。

## 3. 为什么形状必须是 `-uf`

- `config` 的 8 条 force-push `deny` glob（`opencode.jsonc.opencode-go:62-69`）**匹配不到** `-uf` ⇒ 如果被拦住，只可能是插件拦的 ⇒ 判据有判别力。
- `-fu` 会撞 `git push -f*` ⇒ **f 不得居首**（用例固定 `-uf`）。
- 开跑前先用 `detectForcePush` 零成本预检：`git push -uf origin HEAD:refs/heads/main` ⇒ `FORCE`（否则用例会空转）。

## 4. 未覆盖（诚实声明）

- **Allow-always 持久化世界**：非交互会话无法「授予并持久化」授权 ⇒ 该世界在 e2e 里**结构上不可复现**。源码表明钩子**无条件在上游**（Allow-always 只影响下游 `permission.assert`）⇒ `PUSH-GATE-ALLOW-ALWAYS-WORLD-UNVERIFIED` **保留**，但其风险已由源码结论覆盖，不再需要真会话。
- **模型行为面**：模型是否照提示原样执行命令（本次两次都照做了，但这本身不是判据 —— 若没执行，用例按三档规则 skip 为「未判定」）。
- **CI**：该用例走 `E2E_REAL_RUNTIME` 门控 ⇒ 默认 skip、不进 CI（`docs/test-authoring.md` §5）。

## 5. 成本与轮次

- 真会话 **2 次**（PG-1 / PG-2 各 1 次），均无额度告警。
- 未触发 `ib_skip_if_out_of_quota` / `ib_skip_if_timeout`。
