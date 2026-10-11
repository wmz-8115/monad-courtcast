# 录播素材接入

视频尚未提供不会影响合约、运营服务或市场测试：市场时间线在
`engine/prerecordedScenario.ts`，视频只是交易页的显示层。拿到可使用的素材后，
再把五个问题、事件时点和预设结果对齐即可。

## 临时接入方法

启动前端的同一个 PowerShell 窗口中，设置视频 URL：

```powershell
$env:VITE_REPLAY_VIDEO_URL = "/tennis-replay.mp4"
pnpm dev:frontend
```

将视频放在 `frontend/public/tennis-replay.mp4`，浏览器就会在交易页播放器中加载它。
也可以把 `VITE_REPLAY_VIDEO_URL` 设置为一个你有权使用、且允许浏览器跨域播放的
HTTPS MP4/WebM 地址。

## 素材交给我后要做的事

请提供视频文件的本地路径或可访问链接，并说明比赛片段中的每一个关键回合。我会：

1. 记录五个发球/回合事件的准确秒数；
2. 改写预编排的题目与 YES/NO 结果；
3. 让市场在画面事件前 8 秒发布，保持 30–60 秒开放窗口；
4. 用同一轮完整测试确认链上市场、自动下注和视频时间线的对应关系。

不要使用没有获得展示授权的赛事转播素材。
