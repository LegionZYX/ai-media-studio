# 本地内容维护说明

这套站点不使用数据库。

## 内容存放位置

所有网站内容都存放在：

`E:\Vibe coding\AI All in one\api\data\site-content.json`

你有两种修改方式：

1. 打开后台管理页修改
   `http://127.0.0.1:4174`

2. 直接编辑 JSON 文件
   `api/data/site-content.json`

## 当前架构

- `frontend/`
  对外官网
- `admin/`
  本地管理后台
- `api/`
  只负责读取和保存本地 JSON 文件

## 特点

- 没有数据库
- 没有登录系统
- 没有额外部署依赖
- 内容改完即可生效

## 启动方式

分别启动：

- `cd api && npm run dev`
- `cd frontend && npm run dev -- --host 127.0.0.1 --port 4173`
- `cd admin && npm run dev -- --host 127.0.0.1 --port 4174`
