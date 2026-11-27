# TODO — n7：失败模式与回滚可达性

- [x] 读 deps（n3 合并语义 / n4 判据面）并锁定「只消费、不重选」的前提
- [x] 读 `ADR-plan-multi-session-collaboration` 的「已知不可机判清单」/「残留」/D10 口径
- [x] 读 `ADR-plan-delegate-engineering-session` 的停机证据门控 / 亡主接管 / D7 不抢占
- [x] 读 `.rddf/rollback/README.md` + `plan-topics.json`（`edits[]` / `notes` / `retire[]` 体例）
- [x] 写 §2 失败模式表（12 条，覆盖 7 类点名项，可检出性三分 5/3/4）
- [x] 写 §3 可检出性分层（机判 / 显示提示 / 不可检出 各自的载体）
- [x] 写 §4 三步回滚路径（动作 + 落点 + 可验证判据）+ 保留/清理清单
- [x] 写 §5 回滚条目草案（JSON）+ 逐字节钉死表 + 同型经验引用
- [x] 写 §6 反哺清单第二部分（9 条，现象 + path:line + 建议动作）
- [x] 自检：75 处 `path:line`、正文 326 行、结论先行、稳定 token
