const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { checkInbox } = require('./inbox-checker');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const TZ = process.env.TZ || 'Asia/Shanghai';

const startTime = new Date();
const taskLog = [];

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
    `- 版本：V3.9.1.1`,
    `- 线上：https://68a512f8ff83441ea80e2043d97c5348.bj2.agentos-app.net/`,
    `- 账号：106个`,
    `- 本邮件由云端服务自动发送（不依赖本机）`,
    '',
    '## 今日待跟进',
    '- HR字段方案A/B/C：种道阔 8/19前回复',
    '- 采购风控SOP：陆启祥 等反馈',
    '- 数据持久化方案：大哥 等拍板',
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
      from: `"${process.env.SMTP_FROM_NAME || '华缘物流智能体'}" <${process.env.SMTP_USER}>`,
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

// Generic send: POST {to,cc?,subject,body}
app.post('/send', async (req, res) => {
  const { to, cc, subject, body } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: '缺少必填参数: to, subject, body' });
  }
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || '华缘物流智能体'}" <${process.env.SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(',') : to,
      cc: cc ? (Array.isArray(cc) ? cc.join(',') : cc) : undefined,
      subject: String(subject).slice(0, 998),
      text: String(body)
    });
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
        from: `"${process.env.SMTP_FROM_NAME || '华缘物流智能体'}" <${process.env.SMTP_USER}>`,
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
