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

1. 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`。
2. **西排权限**：操作工（worker）只能给西排坑位（种子里的西-1、西-2 这一列）写酸碱度或改坑态；东排、中排一律 403 中文挡下。管理员不受此限。
3. **空名列不得改**：西排权限名单（`ColumnGrant`）中未指派人的列，工人同样被挡下。
4. 酸碱度不得放空值；空提交返回中文 400，不得靠空酸碱蒙混过关。
5. 顶栏两个页签：**坑位场地图** 与 **西排权限**。西排权限专页名单只读（`GET /api/grants`，无改派入口），操作工打开也只能看名单。
6. 坑位带 `version` 版本号，写酸碱 / 改坑态须带 `expected`；两名管理员抢改同一口坑时，旧版本提交返回 409 中文提示，只留一版合法值（`select_for_update` 行锁兜底）。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
