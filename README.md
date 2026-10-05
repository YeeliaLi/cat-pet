# 桌面猫咪：周日程 + 番茄钟

一只透明置顶的桌面猫。点一下猫，弹出一周的日历（时间格）和番茄钟。

## 在 Windows 上运行

1. 安装 [Node.js](https://nodejs.org)（选 LTS 版本），建议再装 VS Code。
2. 解压这个文件夹，在 VS Code 里"打开文件夹"，然后按 Ctrl+` 打开终端
   （或者在文件夹的地址栏输入 `cmd` 回车）。
3. 第一次运行先安装 Electron：

   ```
   npm install --save-dev electron
   ```

4. 启动：

   ```
   npm start
   ```

猫会出现在屏幕右下角。

## 怎么玩

| 操作 | 效果 |
|---|---|
| 单击猫 | 弹出 / 收起日程面板（点面板外面也会自动收起） |
| 按住拖动猫 | 移动位置 |
| 右键猫 / 托盘图标 | 菜单：开始专注、开始休息、停止、退出 |
| 面板里点日历空白处 | 在那个时间新建日程（半小时对齐） |
| 面板里点已有日程 | 编辑、标记完成、删除 |
| 开始专注 | 25 分钟（可改），猫戴上眼镜，头顶显示倒计时；结束后自动进入 5 分钟休息 |
| 电脑闲置一会儿 | 超过 2 分钟没操作，猫会睡着；一动鼠标键盘就醒 |

日程开始的那一分钟，猫会弹气泡并发系统通知。

猫有四种状态：待机、专注（看书戴眼镜）、休息、睡着。番茄钟进行时优先显示专注/休息，空闲时久未操作才会睡着。想调整"多久睡着"，改 `main.js` 顶部的 `SLEEP_AFTER_SEC`（单位：秒）。

## 换成你自己的猫

1. 把终稿图片（PNG / GIF / SVG 都行）放进 `assets/`。
2. 打开 `renderer/pet.js`，修改最上面的 `SPRITES`，把文件名换成你的：

   ```js
   const SPRITES = {
     idle: '../assets/你的待机图.png',
     focus: '../assets/你的专注图.png',
     break: '../assets/你的休息图.png',
     sleep: '../assets/你的睡着图.png',
   };
   ```

   提示：几张图最好**尺寸一致、猫在画面里底部居中对齐**，这样切换状态时不会忽大忽小、上下跳动。
3. 图片大小：在 `renderer/pet.css` 里改 `#cat` 的 `width`。
   如果猫被窗口裁掉了，就同时改 `main.js` 顶部的 `PET_SIZE`。
4. 托盘小图标是 `assets/tray.png`（32×32 左右的 PNG），也可以换掉。

## 文件结构

```
main.js            主进程：窗口、番茄钟计时、日程存储、托盘和右键菜单
preload.js         把主进程的功能安全地交给页面用
renderer/pet.*     猫的窗口（显示、气泡、点击/拖拽判断）
renderer/panel.*   面板窗口（周日历、日程弹窗、番茄钟控制）
assets/            猫的图片和托盘图标
build/icon.ico     打包成 exe 时的应用图标
```

## 打包成 exe

用 `electron-builder` 生成 Windows 安装包。在项目文件夹里：

1. 安装打包工具（electron 若已装过也一起确保存在）：

   ```
   npm install --save-dev electron electron-builder
   ```

2. 打包：

   ```
   npm run dist
   ```

3. 打好的安装程序在 `dist\` 文件夹里，名字像 `桌面猫咪 Setup 0.1.0.exe`。双击即可安装，会在开始菜单和桌面创建快捷方式，并带卸载程序。

说明：

- 第一次打包，electron-builder 会下载一些工具，需要联网、耗时几分钟，属正常。
- 应用图标来自 `build/icon.ico`（我用待机猫生成的，可替换；需是含多尺寸的 .ico）。
- 想改安装包里显示的名字，改 `package.json` 里 `build.productName`。
- `package.json` 的 `author` 建议填成你自己的名字。

## 开机自启

右键猫（或右键托盘图标）→ 勾选 **开机自启动**，再次点击取消。

原理：它调用 Electron 的 `app.setLoginItemSettings`，把当前程序写进 Windows 的登录启动项。

注意：用 `npm start` 开发时，自启记录的是 `electron.exe`，开机不会正确拉起猫；**打包安装成 exe 后，这个开关才真正有效**。所以请在安装版里使用它。

## 数据存在哪

日程、番茄钟设置、每天完成的番茄数保存在一个 JSON 文件里：

```
%APPDATA%\cat-desktop-pet\data.json
```

想备份或清空，直接复制或删除这个文件即可。

## 之后可以加的功能

- 动画：用一组帧图或 GIF 替换静态图，让猫有走动、打哈欠等动作
- 专注结束时让猫跳一下 / 换一个"庆祝"素材
- 重复日程（每周）、拖拽调整日程时间
- 睡着时冒「Zzz」气泡
