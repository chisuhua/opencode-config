# backend-handoff-role-class — 实施任务

> 依据：`.rddf/roadmap/backend-handoff-role-class.md`（planner 产出）+ `docs/adr/ADR-backend-handoff-role-class.md`（Accepted）
> 验收判据：`proposal.md` 的「验收标准」表（AC1–AC23，唯一逐条口径）

## 块 E：治理面文本（**已完成**，2026-11-13，先于 lib 落地）

- [x] E1 `prompts/build.md`：运行身份段 + HANDOFF 契约 + 状态来源条目 + 开场报告例外 + 窗口内切换例外
- [x] E2 `prompts/plan.md`：选类表 + 硬规则 5 条 + 机制未启用降级句
- [x] E3 `prompts/front.md`：路由行 + `role_class` 字段行 + §3.3 HANDOFF 分流 + `git status` 复核
- [x] E4 降级口径（两侧）：lib 未落地时按缺省 `builder`，不得臆造 class / 拒活

## 块 A：校验与权限（`lib/delegate-core.ts`）

- [x] A1 `validateBrief`：`role_class` 值域（缺省只认 `undefined`）+ `null`/`""` 非法 + `kind=knowledge` 互斥 → AC1 / AC2 / AC20
- [x] A2 `archRoots`：四态（配置可用 / 缺失 / 空 / 损坏）+ 全无 ⇒ architect 派发被拒 → AC15
- [x] A3 `normalizeScopePath`：**归一化单一实现**（`scopeEditRules` 改为复用）→ AC10
- [x] A4 `assertRoleClassCompatible`：每项 ⊆ 类上限（不是「有交集」）+ 整个工程拒 + symlink 语义越界拒 → AC3 / AC18
- [x] A5 `classPermissions`：edit 净效果 + **subagent 统一白名单**（deny 在前、五个只读 allow；`general`/`context-builder` 排除；知识 session 不放开）→ AC4 / AC5
- [x] A6 同步 / 异步**共用** `classPermissions`（两链路不漂移）→ AC5

## 块 B：简报与持久化

- [x] B1 `buildBrief()`：「运行身份」段 + 按 class 分支的执行要求 + HANDOFF 契约与首行优先级 → AC16 / AC22
- [x] B2 `role.json` 分区写**独立** `role_class`（`current_role` 仍 `builder`）+ `pair.json` 持久化 → AC6
- [x] B3 `assertResumeRoleClass`：登记值为权威（显式声明不同 ⇒ 硬拒；未声明 ⇒ 沿用登记值；存量条目按缺省 builder）→ AC7 / AC17
- [x] B4 `vanished` 重建沿用原 class（不回落 builder）→ AC19
- [x] B5 `sessions` items 回显 `role_class` → AC20

## 块 C：工具入参

- [x] C1 `delegate` / `dispatch` 的 input schema 接受 `role_class`（enum 三值 + 缺省说明）→ AC1 / AC2

## 块 D：回归与文档

- [x] D1 同步轮次结束后 `pair.state === "idle"` → AC8
- [x] D2 无换类工具入口（注册面仍五个委托工具）→ AC11
- [x] D3 全量回归：`bun test tests/` **448 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23**；`openspec validate` 通过 → AC12
- [x] D4 文档同步：`docs/MULTI-AGENT-DESIGN.md` 一句汇总 + `docs/CHANGELOG.md` v2.21 条目
- [x] D5 遗留清扫：无 TODO / 半截实现 / 临时日志 / skip 测试 / 未替换 mock（已 grep 复核）

## 手工 e2e（不进 CI，模型行为不确定）

- [ ] AC13 给 `builder` 类后端一个 scope **含 `docs/adr`** 的「先改 ADR 再实现」任务 ⇒ `docs/adr/**` 零变更 + feedback 记录 + `idle`
- [ ] AC14 用 fixture 构造 `subagent` 被 deny 的 architect session ⇒ `HANDOFF: blocked`、未自审自批
- [ ] AC9（落点部分）/ AC21 `rddf feedback add` 实际落点 + `rddf` 不可用时的文本 fallback

## 拆出（后续 change，本 change 不做）

- [ ] C.11 `prompts/plan.md` / `prompts/front.md` 的 **resume 前置判据**（同步看首行 / 异步 `rddf feedback list` + `sessions` 确认 idle / 扩 scope = 新 session）—— prompts-only，待本 change 合并后立项
