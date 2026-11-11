# E2E 证据：front-cancel-release

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-11 |
| 执行 | builder |
| 宿主 | opencode **v2.2.5**（`opencode service restart` 后加载新插件代码） |
| 插件 | `~/.config/opencode/plugins/delegate.ts` → `lib/delegate-core.ts` + `lib/delegate-async.ts`（本轮改动） |
| 外部仓库 | `/workspace/main/rdd-workflow-e2e`（bats） |
| 门控 | `E2E_REAL_RUNTIME=1`（真实模型 + 真实宿主） |

## 1. L2-24（本轮新增）

```
$ E2E_REAL_RUNTIME=1 TMPDIR=$PWD/.tmp-l2 bats tests/integration/test_front_delegate_runtime.bats -f "L2-24"
1..1
ok 1 L2-24: cancel 拒绝/force → 放槽 → 同一工作树可再派发（停机证据门控）
EXIT=0
```

**走的分支（如实记录）**：真实运行时里上游 `interrupt` 被受理后清理**很快 settle** ⇒ 第一次 `cancel`（不带 force）
的返回是 `{state:"tombstone", reason:null, forced:false, stop_judge:"wait"}` ⇒ **停机被确认 ⇒ 直接成功**。
⇒ **「拒绝」分支没有被真实运行时触发**（该分支由单测 AC1/AC3/AC5 + 探针 AC19 + 变异 M1 确定性覆盖）。
第二次 `cancel`（带 `force:true`）落在墓碑上 ⇒ 幂等 no-op（`"该后端已是墓碑，无需重复终止"`）。
随后 `dispatch` 到同一工作树**成功** ⇒ 槽位已释放。

**被断言的不变量**（确定性）：① 存在带 `force:true` 的 `cancel` 调用；② 台账条目最终 `tombstone`；
③ 两次 `dispatch` 都成功；④ 同一 `work_root` 的占槽条目 ≤ 1（无双写者）；⑤ 若有被拒的 `cancel`，其返回必须带 `reason` 且 `state` 不是 `tombstone`。

## 2. 既有 E2E 回归（L2-19 / L2-20 / L2-22 / L2-23）

```
$ E2E_REAL_RUNTIME=1 TMPDIR=$PWD/.tmp-l2 bats tests/integration/test_front_delegate_runtime.bats -f "L2-19|L2-20|L2-22|L2-23|L2-24"
1..5
ok 1 L2-19: 单槽 —— 同一工作树第二个 dispatch 被拒（错误含占槽者 id）
ok 2 L2-20: suspend 暂停 —— 释放槽位 + pair 的 state 变 suspended
ok 3 L2-22: 往返切换 —— dispatch A → suspend A → dispatch B → suspend B → resume A，A 不被重建
ok 4 L2-23: 运行中 resume 被拒 —— dispatch(resume=正在跑的后端) 报错且不写 dispatched 行
not ok 5 L2-24: ...（**环境原因**，见 §3）
```

## 3. L2-24 后续两次重试失败的原因（**环境，非实现**）

| 次 | 现象 | 根因 |
|---|---|---|
| 第 2 次 | 第二次 `dispatch` 被「并发上限已达（3/3）」拒绝 | **E2E 自身污染**：上一轮场景留下的后端占满全局并发上限（`RDDF_MAX_ACTIVE_BACKENDS` 默认 3）⇒ 判据未被触发。清理 10 个残留后端后重跑 |
| 第 3 次 | 场景**零 tool_use**，`exit_code=1` | **模型额度耗尽**：`provider.rate-limit` 429「当前已达到 Token Plan 用量上限」 |

⇒ 两次重试都不是实现缺陷：第 2 次是 bats 文件已记载的已知脆弱点（"残留会占满全局并发上限，让后续场景被误拒"），
第 3 次是外部配额。**L2-24 的有效证据是第 1 次（§1）**。

## 4. 已知脆弱点（如实登记，不在本轮修）

- **E2E 的后端清理不可靠**：`l2_cleanup_backends` 把 curl 的**退出码**当成功（不校验 HTTP 状态）⇒ 删除失败时静默；
  且全局并发上限（3）很容易被跨场景残留吃掉。本轮 5 个用例的**顺序重跑**必须手动清场。
  ⇒ 该缺陷属 E2E 工程债务，与本次 change 无关（已在本报告登记，未修）。
- **`L2-24` 的「拒绝」分支不可在真实运行时确定性触发**（上游 settle 快）⇒ 该分支的判据由单测 + 探针 + 变异承担。
