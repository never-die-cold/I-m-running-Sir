# 数据契约

本文定义 Demo / Unity / Android 三端共享的数据接口。改任何字段请同步
`demo/js/ui.js`（JSON 组包）、`unity/Assets/Scripts/Core/RunSession.cs`
（C# 组包）与 Android 端读取逻辑，并跑 `node tools/verify-demo.js` 与 SimHarness。

## 1. 坐标流 `lpr_route.json`

写入 `/data/local/tmp/lpr_route.json`（Android MockLocationDriver 轮询读取），
1Hz 覆写，UTF-8 无 BOM。

```json
{
  "v": 1,
  "seq": 835,
  "active": true,
  "running": true,
  "distanceMeters": 2501.58,
  "durationSeconds": 835.0,
  "paceSecPerKm": 278.8,
  "updatedAtMs": 1790590590872,
  "fix": {
    "lat": 31.3584279,
    "lon": 120.3814773,
    "timeMs": 1790590590872,
    "elapsedRealtimeNanos": 835000000000,
    "accuracy": 9.12,
    "speed": 3.587,
    "bearing": 177.61,
    "altitude": 11.35,
    "satellites": 9,
    "provider": "gps"
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `v` | int | 契约版本，当前 `1` |
| `seq` | int | fix 序号，单调递增 |
| `active` | bool | 注入开关（App 侧可暂停） |
| `running` | bool | 会话是否进行中 |
| `distanceMeters` | number | App 侧记录里程（过滤精度差/速度越界 fix 后累计） |
| `durationSeconds` | number | 会话时长（秒） |
| `paceSecPerKm` | number | 当前瞬时配速（秒/公里），0 表示静止 |
| `updatedAtMs` | int | 组包墙钟（毫秒） |
| `fix.lat/lon` | number | WGS84 经纬度（7 位小数） |
| `fix.timeMs` | int | fix 墙钟时间 |
| `fix.elapsedRealtimeNanos` | int | 开机单调时钟（纳秒），必须单调递增 |
| `fix.accuracy` | number | 定位精度（米，模拟 5~13m，上限过滤 35m） |
| `fix.speed` | number | 速度 m/s（OU 平滑，0.15 以下归零） |
| `fix.bearing` | number | 航向角 0~360°（含 ±3° 噪声） |
| `fix.altitude` | number | 海拔（15m ±4m 抖动） |
| `fix.satellites` | int | 模拟卫星数 7~12 |
| `fix.provider` | string | 恒为 `"gps"` |

**配速合法性带**：`3'00"~9'00"/km`（180~540 s/km）。`speed>0.3` 的采样
不允许越界；App 侧累计里程时会丢弃精度 >35m 或隐含速度 >8m/s 的跳变点。

## 2. 校园注册表（JS `registerCampus`）

```js
{
  id: "suzhou", name, subtitle,
  origin: { lat, lon },        // WGS84 近似原点
  roads:   [{ name, pts:[{x,y}...], w, closed?, style?, isTrack? }],
  buildings: [{ n, c:{x,y}, s:{x,y}, k }],        // k: library/teach/lab/dorm...
  water:   [{ name, c, rx, ry } | { name, pts, w }],
  forests: [{ name, c, rx, ry, count, seed }],
  trails:  [{ pts, closed? }],
  landmarks: [{ n, c:{x,y}, r, desc }],           // r: 巡礼发现半径(米)
  gates:   [{ n, c:{x,y} }],
  mainRoutePts: [{x,y}...]                        // 闭合主环线
}
```

坐标均为游戏局部坐标（米，+x 东 / +y 北）。C# 侧对应
`CampusLayout.CreateSuzhou()`（道路/建筑/主环线/原点为契约字段，
水系/林木/地标为 JS 渲染层概念）。

## 3. JS 模块加载顺序（`demo/index.html`）

`geo → campus → campus-suzhou → campus-demo → sim → battle → store →
env → sfx → render → ui → main`

普通 `<script>` 全局共享（非 ES module），保证 `file://` 双击可玩。

## 4. verify-demo.js 依赖的全局接口（不可破坏）

- `resetRun()`：重置会话到路线起点（checkpoint 模式默认 3 个打卡点）
- `session`：`checkpoints / route / tickAutopilot(dt, wallMs, baseSpeed) /
  recordedDist / duration / trueDist / setMode / spawnCheckpoints`
- `tickAutopilot` 三参签名不变；`session.tick` 第 5 参 `sprintWanted` 可选
- `BATTLE`（battle.js）：`state / wave / kills / exp / expNext / level /
  player / enemies / bullets / choices / reset(seed) / tick(dt, pos, moving)`
- `Progress`（store.js）：`unlock / observe(session, battle?, env?) /
  finishRun / rateRun / data{ach,totalDistM,totalKills,best}`
- `ENV`（env.js）：`reset(seed) / tick(dt, scale) / isNight / isRain /
  clockText / skyTint / minutes / weather`
- `Store`（store.js）：`read(k, dflt) / write(k, v) / persistent()`——
  localStorage 不可用时自动降级内存，headless 沙箱零依赖

## 5. 验证入口

| 命令 | 覆盖 |
| --- | --- |
| `node tools/verify-demo.js` | 配速带/瞬移/噪声/里程偏差/打卡可达 + 校区完整性 + 玩法/战斗/成就/环境 58 项 |
| `dotnet run -c Release --project tools/SimHarness` | C# Core 同构检查 9 项 + 轨迹输出（out/trace.csv 等） |
| `./verify-all.ps1` | 以上两项 + Unity 目录树 + Android 工件（LpRunHook 为本地可选项） |
