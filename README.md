# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后是按行列铺开的坑位，点坑登记浸液酸碱度并改状态。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

- 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`。
- 西排权限：操作工只能改名单在册的排（种子里是西排：西-1、西-2）；东排、中排名单为空，仅管理员可改。名单见顶栏「西排权限」专页，只读。
- 登记酸碱度 / 改坑态带 `version` 乐观锁：两人抢着改同一口坑，只留一版，后到者收到 409 中文提示。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
