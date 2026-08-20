const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { checkInbox } = require('./inbox-checker');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* CORS: 允许 CloudStudio 域名和本地访问调用反馈API */
app.use(function(req, res, next) {
  var origin = req.headers.origin || '';
  var allowed = ['https://68a512f8ff83441ea80e2043d97c5348.bj2.agentos-app.net', 'http://localhost:3000', 'http://127.0.0.1:3000'];
  if (allowed.indexOf(origin) >= 0 || origin.indexOf('.agentos-app.net') >= 0) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const PORT = process.env.PORT || 3000;
const TZ = process.env.TZ || 'Asia/Shanghai';

const startTime = new Date();
const taskLog = [];

/* 内存存储登录记录（最多保留 2000 条，防止内存溢出。）
 * 同时持久化到文件 login_logs_store.json，Render 重启后可恢复。
 * 用于 /api/login-logs/query 接口给 login_records.html 页面拉取全局数据。 */
const loginLogsStore = [];
const LOGIN_LOGS_MAX = 2000;
const LOGIN_LOGS_FILE = path.join(__dirname, 'login_logs_store.json');

function saveLoginLogs() {
  try {
    fs.writeFileSync(LOGIN_LOGS_FILE, JSON.stringify(loginLogsStore.slice(-LOGIN_LOGS_MAX)), 'utf8');
  } catch (e) { console.error('saveLoginLogs failed:', e.message); }
}

function loadLoginLogs() {
  try {
    if (fs.existsSync(LOGIN_LOGS_FILE)) {
      var data = JSON.parse(fs.readFileSync(LOGIN_LOGS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(function (r) { loginLogsStore.push(r); });
        if (loginLogsStore.length > LOGIN_LOGS_MAX) {
          loginLogsStore.splice(0, loginLogsStore.length - LOGIN_LOGS_MAX);
        }
        logTask('system', 'info', '从文件恢复 ' + data.length + ' 条登录记录');
      }
    }
  } catch (e) { logTask('system', 'warn', '恢复登录记录失败: ' + e.message); }
}
loadLoginLogs();

function logTask(type, status, detail) {
  const entry = {
    time: new Date().toLocaleString('zh-CN', { timeZone: TZ }),
    type,
    status,
    detail
  };
  taskLog.unshift(entry);
  if (taskLog.length > 100) taskLog.pop();
  console.log(`[${entry.time}] ${type} | ${status} | ${detail}`);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.qiye.163.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'ljy@shhy66.com',
    pass: process.env.SMTP_PASS
  }
});

async function sendDailyReport() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  const weekday = weekdays[now.getDay()];

  const reportTo = process.env.REPORT_TO || 'xuqiang@qtkj-tech.com';
  const reportCC = process.env.REPORT_CC || 'ljy@shhy66.com';

  const body = [
    '徐强：',
    '',
    `今日系统测试日报 ${dateStr}（${weekday}）`,
    '',
    '## 系统状态',
    `- 版本：V3.9.10`,
    `- 线上：https://68a512f8ff83441ea80e2043d97c5348.bj2.agentos-app.net/`,
    `- 账号：106个`,
    `- 本邮件由云端服务自动发送（不依赖本机）`,
    '',
    '## 今日待跟进',
    '- CloudStudio需同步最新代码（V3.9.6~V3.9.10，徐强负责）',
    '- L4字段重构（V3.9.10）：取消台套/成本字段，新增费用明细字段；L3汇总数据源暂断层，待运营/商务定义换算口径',
    '- 采购风控SOP：陆启祥 等反馈',
    '- 登录记录邮件刷屏已修复（V3.9.9服务端去重）',
    '',
    '## 说明',
    '本邮件为云端服务自动发送的简版日报。',
    '完整日报（含今日处理明细、Bug修复详情、登录记录监控）',
    '需大哥开机后由智能体生成并发送。',
    '如本邮件在17:00准时收到，说明云端服务运行正常。',
    '',
    '华缘物流云端服务',
    `发送时间：${now.toLocaleString('zh-CN', { timeZone: TZ })}`
  ].join('\n');

  try {
    const info = await transporter.sendMail({
      from: { name: process.env.SMTP_FROM_NAME || '华缘物流智能体', address: process.env.SMTP_USER || 'ljy@shhy66.com' },
      to: reportTo,
      cc: reportCC,
      subject: `华缘物流系统测试日报 ${dateStr}（${weekday}）- 云端自动发送`,
      text: body
    });
    logTask('daily_report', 'success', `已发送至 ${reportTo} CC ${reportCC}, messageId: ${info.messageId}`);
    return true;
  } catch (err) {
    logTask('daily_report', 'error', `发送失败: ${err.message}`);
    return false;
  }
}

async function runInboxCheck() {
  try {
    const result = await checkInbox({
      host: process.env.IMAP_HOST || 'imap.qiye.163.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      user: process.env.IMAP_USER || 'ljy@shhy66.com',
      pass: process.env.IMAP_PASS,
      alertTo: process.env.ALERT_TO || 'ljy@shhy66.com',
      transporter
    });
    logTask('inbox_check', result.status, result.detail);
    return result;
  } catch (err) {
    logTask('inbox_check', 'error', err.message);
    return { status: 'error', detail: err.message };
  }
}

// Scheduled tasks
// Daily report at 17:00 (Asia/Shanghai)
cron.schedule('0 17 * * *', () => {
  logTask('cron', 'info', '触发17:00日报发送');
  sendDailyReport();
}, { timezone: TZ });

// Inbox check every 30 minutes from 8:00-20:00
cron.schedule('0,30 8-20 * * *', () => {
  logTask('cron', 'info', '触发邮箱检查');
  runInboxCheck();
}, { timezone: TZ });

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'huayuan-cloud-service',
    status: 'running',
    startTime: startTime.toLocaleString('zh-CN', { timeZone: TZ }),
    uptime: Math.floor((Date.now() - startTime.getTime()) / 1000) + 's',
    timezone: TZ,
    smtpConfigured: !!process.env.SMTP_PASS,
    imapConfigured: !!process.env.IMAP_PASS
  });
});

// Task log endpoint
app.get('/logs', (req, res) => {
  res.json({
    total: taskLog.length,
    logs: taskLog.slice(0, 50)
  });
});

// Manual trigger: send daily report
app.post('/trigger/report', async (req, res) => {
  logTask('manual', 'info', '手动触发日报发送');
  const ok = await sendDailyReport();
  res.json({ success: ok });
});

// Manual trigger: inbox check
app.post('/trigger/inbox', async (req, res) => {
  logTask('manual', 'info', '手动触发邮箱检查');
  const result = await runInboxCheck();
  res.json(result);
});

// Feedback endpoint: receives feedback from frontend, sends email, returns real success/failure
app.post('/api/feedback', async (req, res) => {
  var d = req.body || {};
  if (!d.dept && !d.desc) {
    return res.status(400).json({ success: false, error: '缺少必填参数: dept, desc' });
  }
  var catNames = { bug: 'Bug报告', suggestion: '改进建议', question: '疑问咨询', other: '其他' };
  var catLabel = catNames[d.cat] || d.cat || '未分类';
  var subject = d.subject || ('【' + (d.dept || '未知部门') + ' - 反馈】' + catLabel);

  var body = [
    '部门：' + (d.dept || '未知'),
    '负责人：' + (d.owner || '未知'),
    '反馈类型：' + catLabel,
    '优先级：' + (d.priority || '未设置'),
    '功能模块：' + (d.feature || '未指定'),
    '',
    '问题描述：',
    d.desc || '（无描述）',
    '',
    '期望行为：',
    d.expected || '（无）',
    '',
    '测试人邮箱：' + (d.email || '未提供'),
    '模块版本：' + (d.version || '未知'),
    '提交时间：' + (d.time || new Date().toLocaleString('zh-CN', { timeZone: TZ })),
    '',
    '—— 本邮件由华缘物流云端服务 /api/feedback 接口自动发送',
    '—— 反馈来源：测试界面反馈面板'
  ].join('\n');

  var feedbackTo = 'ftzi9285@agent.qq.com';
  var feedbackCC = 'ljy@shhy66.com';
  if (d.email && d.email.indexOf('@') > 0) {
    feedbackCC = feedbackCC + ', ' + d.email;
  }

  try {
    var info = await transporter.sendMail({
      from: { name: process.env.SMTP_FROM_NAME || '华缘物流智能体', address: process.env.SMTP_USER || 'ljy@shhy66.com' },
      to: feedbackTo,
      cc: feedbackCC,
      subject: String(subject).slice(0, 998),
      text: body
    });
    logTask('feedback', 'success', 'dept=' + (d.dept || '?') + ' cat=' + catLabel + ' to=' + feedbackTo);
    res.json({ success: true, messageId: info.messageId, message: '反馈已通过云端服务发送邮件' });
  } catch (err) {
    logTask('feedback', 'error', err.message);
    res.status(500).json({ success: false, error: err.message, message: '邮件发送失败：' + err.message });
  }
});

// Login logs: POST {records: [...], visitorId?}
// V3.9.9：服务端去重（time+u+action），防止客户端 pagehide 重复上报刷屏邮件
app.post('/api/login-logs', async (req, res) => {
  var d = req.body || {};
  var records = Array.isArray(d.records) ? d.records : [];
  if (records.length === 0) {
    return res.status(400).json({ success: false, error: '缺少必填参数: records' });
  }

  /* 去重：基于 (time + u + action) 三元组，同批内+历史库都不重复 */
  var existingKeys = new Set();
  loginLogsStore.forEach(function (s) {
    existingKeys.add((s.time || '') + '|' + (s.u || '') + '|' + (s.action || ''));
  });
  var newRecords = [];
  var dupCount = 0;
  records.forEach(function (r) {
    var key = (r.time || '') + '|' + (r.u || '') + '|' + (r.action || '');
    if (existingKeys.has(key)) { dupCount++; return; }
    existingKeys.add(key); /* 防止同批内重复 */
    newRecords.push(r);
  });

  if (newRecords.length === 0) {
    /* 全部重复，返回 success（让客户端标记为已上报），但不发邮件 */
    logTask('login-logs', 'info', 'all ' + records.length + ' records are duplicates, email skipped');
    return res.json({ success: true, stored: 0, duplicates: dupCount, message: '记录已存在(去重)' });
  }

  var actionNames = { login: '登录成功', fail: '登录失败', logout: '退出登录' };
  var rows = newRecords.map(function (r, i) {
    return (i + 1) + '. [' + (r.time || '?') + '] ' + (actionNames[r.action] || r.action) + ' | ' +
      (r.u || '未知账号') + (r.n ? '(' + r.n + ')' : '') +
      (r.lvl ? ' | ' + r.lvl : '') + (r.dept ? ' | ' + r.dept : '') + (r.base ? ' | ' + r.base : '') +
      (r.reason ? ' | 原因:' + r.reason : '') + (r.duration ? ' | 在线' + r.duration + '分钟' : '') +
      ' | 页面:' + (r.page || '?') + ' | 访客:' + (r.vid || '?');
  }).join('\n');

  var subject = '[登录记录] ' + newRecords.length + '条 | ' + new Date().toLocaleString('zh-CN', { timeZone: TZ });
  var body = [
    '类型：账号登录记录（云端上报）',
    '条数：' + newRecords.length,
    '上报访客ID：' + (d.visitorId || '未知'),
    '',
    '明细：',
    rows,
    '',
    '—— 本邮件由华缘物流云端服务 /api/login-logs 接口自动发送'
  ].join('\n');

  try {
    var info = await transporter.sendMail({
      from: { name: process.env.SMTP_FROM_NAME || '华缘物流智能体', address: process.env.SMTP_USER || 'ljy@shhy66.com' },
      to: 'ftzi9285@agent.qq.com',
      cc: 'ljy@shhy66.com',
      subject: String(subject).slice(0, 998),
      text: body
    });
    logTask('login-logs', 'success', 'new=' + newRecords.length + ' dup=' + dupCount + ' visitor=' + (d.visitorId || '?'));
    /* 只存新记录（去重后的） */
    newRecords.forEach(function (r) {
      loginLogsStore.push({
        time: r.time || new Date().toLocaleString('zh-CN', { timeZone: TZ }),
        action: r.action || '',
        u: r.u || '',
        n: r.n || '',
        lvl: r.lvl || '',
        dept: r.dept || '',
        base: r.base || '',
        reason: r.reason || '',
        duration: r.duration || '',
        page: r.page || '',
        vid: r.vid || '',
        reportedBy: d.visitorId || ''
      });
    });
    if (loginLogsStore.length > LOGIN_LOGS_MAX) {
      loginLogsStore.splice(0, loginLogsStore.length - LOGIN_LOGS_MAX);
    }
    saveLoginLogs();
    res.json({ success: true, messageId: info.messageId, message: '登录记录已上报云端', stored: newRecords.length, duplicates: dupCount });
  } catch (err) {
    logTask('login-logs', 'error', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login logs query: GET /api/login-logs/query?days=7&limit=500
app.get('/api/login-logs/query', (req, res) => {
  var days = parseInt(req.query.days, 10) || 30;
  var limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
  var since = Date.now() - days * 24 * 60 * 60 * 1000;
  var result = loginLogsStore.filter(function (r) {
    var t = new Date(r.time.replace(/-/g, '/')).getTime() || 0;
    return t >= since;
  }).slice(-limit);
  res.json({
    success: true,
    count: result.length,
    totalStored: loginLogsStore.length,
    records: result
  });
});

// Generic send: POST {to,cc?,subject,body,html?}
app.post('/send', async (req, res) => {
  const { to, cc, subject, body, html } = req.body || {};
  if (!to || !subject || (!body && !html)) {
    return res.status(400).json({ error: '缺少必填参数: to, subject, body 或 html' });
  }
  try {
    var mailOptions = {
      from: { name: process.env.SMTP_FROM_NAME || '华缘物流智能体', address: process.env.SMTP_USER || 'ljy@shhy66.com' },
      to: Array.isArray(to) ? to.join(',') : to,
      cc: cc ? (Array.isArray(cc) ? cc.join(',') : cc) : undefined,
      subject: String(subject).slice(0, 998)
    };
    if (html) {
      mailOptions.html = String(html);
    }
    if (body) {
      mailOptions.text = String(body);
    }
    const info = await transporter.sendMail(mailOptions);
    logTask('send', 'success', `to=${Array.isArray(to) ? to.join(',') : to} subj="${String(subject).slice(0, 30)}..."`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    logTask('send', 'error', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  logTask('system', 'info', `云端服务启动 端口 ${PORT} 时区 ${TZ}`);
  console.log(`Huayuan Cloud Service running on port ${PORT}`);
  console.log(`Timezone: ${TZ}`);
  console.log(`SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} user=${process.env.SMTP_USER ? 'configured' : 'NOT SET'}`);
  console.log(`IMAP: ${process.env.IMAP_HOST}:${process.env.IMAP_PORT} user=${process.env.IMAP_USER ? 'configured' : 'NOT SET'}`);

  // Startup check: send test if configured
  if (process.env.SMTP_PASS && process.env.SMTP_PASS !== 'YOUR_AUTH_CODE_HERE') {
    setTimeout(() => {
      logTask('system', 'info', 'SMTP已配置，5秒后发送启动通知邮件');
      transporter.sendMail({
        from: { name: process.env.SMTP_FROM_NAME || '华缘物流智能体', address: process.env.SMTP_USER || 'ljy@shhy66.com' },
        to: process.env.ALERT_TO || 'ljy@shhy66.com',
        subject: '【云端服务已启动】华缘物流邮件服务上线通知',
        text: `云端邮件服务已启动。\n\n服务地址：${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}\n启动时间：${new Date().toLocaleString('zh-CN', { timeZone: TZ })}\n\n定时任务：\n- 每天17:00 自动发送日报\n- 每30分钟(8:00-20:00) 检查邮箱\n\n此邮件由云端服务自动发送，不需要电脑开机。`
      }).then(() => logTask('system', 'success', '启动通知邮件已发送'))
        .catch(err => logTask('system', 'error', `启动通知邮件发送失败: ${err.message}`));
    }, 5000);
  } else {
    logTask('system', 'warning', 'SMTP密码未配置，邮件功能暂不可用。请在.env中设置SMTP_PASS');
  }
});
