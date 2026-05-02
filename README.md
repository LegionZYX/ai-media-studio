# AI Media Studio

一个给普通用户直接使用的网页工具，支持：

- `OpenAI` 图片生成
- `OpenAI` 图生图
- `Seedance` 文生视频
- `Seedance` 图生视频
- `Seedance` 真人模式与素材工作流

当前仓库采用轻量三段式结构：

- `frontend/` 用户前台
- `admin/` 内容管理台
- `api/` 本地 JSON + Seedance 代理 API

## 本地启动

```powershell
.\start-local.ps1
```

默认地址：

- 前台：`http://127.0.0.1:4173`
- 后台：`http://127.0.0.1:4174`
- API：`http://127.0.0.1:8787`

## 前台配置

前台通过环境变量读取工具 API 地址：

```bash
VITE_TOOL_API_BASE=http://127.0.0.1:8787
```

如果不设置，前台默认仍会使用本地开发地址。

## GitHub Pages

仓库已包含 GitHub Pages 工作流，会自动构建并发布 `frontend/`。

注意：

- GitHub Pages 只能托管前台静态站点
- `Seedance` 视频能力依赖 `api/` 代理服务
- 如果要让所有用户直接在线使用视频能力，你还需要把 `api/` 部署到一个可公网访问的 Node.js 平台，然后把 `VITE_TOOL_API_BASE` 指向那个地址

## 推荐的完整公网部署方式

1. GitHub Pages：部署 `frontend/`
2. Render / Railway / Fly.io：部署 `api/`
3. `admin/` 保留本地或单独内网部署
