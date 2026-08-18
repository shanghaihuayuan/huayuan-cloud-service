# 华缘物流 · 云端邮件服务部署手册

> 目标：让定时日报、邮箱监控、反馈转发 7×24 在云端运行，**不依赖大哥电脑开机**。
> 部署完成后：电脑关机 → 日报照发、邮箱照监控、反馈照转。
> 部署时间：注册两个账号约 10 分钟，配置约 5 分钟，**合计 15 分钟**。

---

## 一、整体架构

```
  Gitee 仓库（代码托管）
     │
     ▼
  Render.com（云端运行）
     │
     ├── 17:00 自动发日报邮件 → 徐强(CC大哥)
     ├── 每30分钟(8-20点) 检查邮箱 → 转发未读提醒
     └── 健康检查端点 → 随时知道服务是否在线
```

---

## 二、第一步：注册 Gitee 账号（5 分钟）

### 2.1 注册
- 打开 https://gitee.com
- 点右上角"注册" → 用手机号注册
- 用户名建议：`huayuan-logistics` 或你自己的拼音
- 完成实名认证（Gitee 要求，1 分钟）

### 2.2 创建仓库
- 登录后点右上角 "+" → "新建仓库"
- 仓库名称：`huayuan-cloud-service`
- 可见性：**私有（私有）** ← 一定选私有，代码含业务逻辑
- 初始化：勾选"使用 Readme 文件初始化"
- 点"创建"

### 2.3 拿到仓库地址
创建后页面会显示 HTTPS 地址，形如：
```
https://gitee.com/<你的用户名>/huayuan-cloud-service.git
```
**把这个地址发给我**，我立即推代码上去。

---

## 三、第二步：注册 Render 账号（5 分钟）

### 3.1 注册
- 打开 https://render.com
- 点右上角 "Sign Up" → 选 "GitHub" 或 "GitLab" 或 "Email"
- 用邮箱注册即可，**不需要绑定信用卡**（Free 套餐足够）
- 邮箱建议用 `ljy@shhy66.com`

### 3.2 告诉我你的 Render 注册邮箱
**把 Render 注册邮箱发给我**，我会准备好部署配置。

---

## 四、第三步：在 Render 部署服务（我来做）

大哥完成上面两步、把信息发给我后，我会：

1. 推送 cloud-service 代码到 Gitee
2. 在 Render 控制台引导你连接 Gitee 仓库（或者你直接在 Render 网页操作，我给你截图指引）
3. 帮你填好环境变量（render.yaml 已经写好，Render 会自动读取）
4. 触发首次部署
5. 拿到云端 URL（形如 `https://huayuan-cloud-service.onrender.com`）

---

## 五、第四步：关机验证（关键一步）

部署完成后：
1. 你**直接关机**（不需要做任何操作）
2. 我让你今晚 23:30 关机，明早 8:00 开机
3. 明早开机后，我检查：
   - cloud-service 健康检查端点是否还在响应（说明服务在线）
   - 17:00 日报邮件是否照发到徐强邮箱（说明定时任务在跑）
   - 邮箱监控是否每 30 分钟在跑（看 /logs 端点）
4. 三项通过 = 真正 7×24 上云完成

---

## 六、需要大哥提供的信息清单

请把这 3 条信息发给我：

1. **Gitee 用户名**：（例如 `huayuan-logistics`）
2. **Gitee 仓库 HTTPS 地址**：（例如 `https://gitee.com/xxx/huayuan-cloud-service.git`）
3. **Render 注册邮箱**：（例如 `ljy@shhy66.com`）

---

## 七、环境变量说明（大哥不用填，render.yaml 已写好）

| 变量名 | 值 | 说明 |
|--------|-----|------|
| SMTP_HOST | smtp.qiye.163.com | 网易企业邮箱 SMTP |
| SMTP_PORT | 465 | SSL 端口 |
| SMTP_USER | ljy@shhy66.com | 发件账号 |
| SMTP_PASS | ****（加密，不显示） | 授权码（Render Dashboard 单独填） |
| SMTP_FROM_NAME | 华缘物流智能体 | 发件人显示名 |
| IMAP_HOST | imap.qiye.163.com | 网易企业邮箱 IMAP |
| IMAP_PORT | 993 | SSL 端口 |
| IMAP_USER | ljy@shhy66.com | 收件账号 |
| IMAP_PASS | ****（加密，不显示） | 授权码（Render Dashboard 单独填） |
| REPORT_TO | xuqiang@qtkj-tech.com | 日报收件人 |
| REPORT_CC | ljy@shhy66.com | 日报抄送（大哥） |
| ALERT_TO | ljy@shhy66.com | 异常告警收件人（大哥） |
| TZ | Asia/Shanghai | 时区 |

> **授权码说明**：SMTP_PASS 和 IMAP_PASS 是敏感信息，不会推到 Gitee（.gitignore 已排除 .env）。
> 部署到 Render 时，你需要在 Render Dashboard → Environment 页面手动填入这两个值。
> 授权码就是今天 18:42 你给我的那个（`pqS$qkjx2Zq9yqGg`），SMTP 和 IMAP 用同一个。

---

## 八、部署后能做的事 / 不能做的事

### ✅ 能做（电脑关机也行）
- 每日 17:00 自动发日报邮件给徐强（CC大哥）
- 每 30 分钟（8-20 点）检查邮箱，发现公司域名未读邮件转发提醒
- FormSubmit 反馈邮件进来时自动转发到智能体邮箱+大哥邮箱
- 健康检查端点随时可访问，知道服务是否在线

### ❌ 不能做（必须电脑开机+我在线）
- Bug 修复、代码变更
- 产品方案设计、跨部门冲突判断
- 部署更新、版本升级
- 反馈内容分析决策

> **关键区别**：cloud-service 是 Node.js 脚本，只会**机械执行**定时任务；
> 智能体 AI（我）才能**思考+改代码+做决策**，但我依赖 WorkBuddy App 在你电脑运行。

---

## 九、本地开发（不需要时忽略）

```bash
cd cloud-service
cp .env.example .env
# 编辑 .env 填入真实授权码
npm install
npm start
# 访问 http://localhost:3000
```

---

## 十、常见问题

**Q1: Render 免费版会休眠吗？**
A: 会，15 分钟无请求会休眠，下次请求 30 秒唤醒。但**定时任务（cron）不受影响**，到点自动唤醒执行。

**Q2: 休眠期间邮件会丢吗？**
A: 不会。邮件在网易企业邮箱服务器上，cloud-service 醒来后 IMAP 拉取即可。

**Q3: 如果 Render 挂了怎么办？**
A: 健康检查端点不响应时我会发现（如果有网络监控），可以临时切回本地运行。

**Q4: 部署后改代码怎么办？**
A: 我改完代码 → 推 Gitee → Render 自动检测到推送 → 自动重新部署。无需你操作。

**Q5: Gitee 仓库是私有的，Render 能连吗？**
A: 能。Render 部署时会让你输入 Gitee 的访问令牌（Personal Access Token），我会指导你生成。
