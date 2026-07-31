# THE LOOK BOOK

一款极简的个人衣橱与穿搭记录网站。

## 在线使用

[打开 THE LOOK BOOK](https://succiyu666-create.github.io/yiji-wardrobe/)

## 功能

- 上传、编辑和归档衣服单品
- 按分类、名称、颜色和季节筛选
- 记录购买价格、穿着次数和最后穿着日期
- 自动计算平均单次穿搭成本，并筛出久未穿的单品
- 选择多件单品创建搭配，并自动生成拼贴封面
- 点开任意单品，查看所有包含它的搭配
- 编辑或删除已有搭配
- 数据和照片保存在当前设备的浏览器中

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
pnpm install
pnpm run dev
```

正式构建：

```bash
pnpm run build
```

GitHub Pages 静态构建：

```bash
pnpm run build:pages
```

推送到 `main` 分支后，GitHub Actions 会自动更新线上网站。

## 数据说明

第一版不需要账号和服务器。所有单品、搭配和照片都存储在浏览器的
IndexedDB 中，因此不同浏览器或不同设备之间不会自动同步。清除浏览器
站点数据会同时清除衣橱记录。
