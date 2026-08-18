const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function checkInbox(config) {
  const { host, port, user, pass, alertTo, transporter } = config;

  if (!user || !pass || pass === 'YOUR_AUTH_CODE_HERE') {
    return { status: 'skipped', detail: 'IMAP credentials not configured' };
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const stats = await client.mailboxOpen('INBOX');
      const total = stats.exists || 0;

      // Get last 10 messages
      const messages = [];
      if (total > 0) {
        const startSeq = Math.max(1, total - 9);
        for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true, flags: true })) {
          const env = msg.envelope;
          const msgDate = env.date ? new Date(env.date) : new Date();
          messages.push({
            from: env.from && env.from[0] ? `${env.from[0].name || ''} <${env.from[0].address}>` : 'unknown',
            fromAddr: env.from && env.from[0] ? env.from[0].address : '',
            subject: env.subject || '(no subject)',
            date: msgDate,
            dateStr: msgDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            seen: msg.flags && msg.flags.has('\\Seen')
          });
        }
      }
      const unread = messages.filter(m => !m.seen).length;

      // Only alert for unread messages from the last 24 hours, from company domains only
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const autoSenders = ['formsubmit', 'noreply', 'no-reply', 'notification', 'mailer', 'postmaster', 'agent.qq.com'];
      // Only care about company-related senders
      const companyDomains = ['shhy66.com', 'qtkj-tech.com'];
      const recentHumanUnread = messages.filter(m => {
        if (m.seen) return false;
        if (m.date <= oneDayAgo) return false;
        if (autoSenders.some(s => m.fromAddr.toLowerCase().includes(s))) return false;
        // Only alert for company domain senders
        return companyDomains.some(d => m.fromAddr.toLowerCase().includes(d));
      });

      if (recentHumanUnread.length > 0) {
        // Forward summary to alert recipient
        const summary = recentHumanUnread.map(m => `- ${m.from}: ${m.subject} (${m.dateStr})`).join('\n');
        const body = [
          '检测到最近24小时内新未读邮件，请及时查看：',
          '',
          summary,
          '',
          '此邮件由云端服务自动发送。完整内容请登录邮箱查看。',
          '',
          `邮箱：${user}`,
          `检测时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
        ].join('\n');

        await transporter.sendMail({
          from: `"华缘物流云端服务" <${process.env.SMTP_USER}>`,
          to: alertTo,
          subject: `【新邮件提醒】${recentHumanUnread.length}封未读邮件需要查看`,
          text: body
        });

        return {
          status: 'alert_sent',
          detail: `${total}封邮件，最近10封中${unread}封未读，${recentHumanUnread.length}封需要关注（24h内），已转发提醒至${alertTo}`
        };
      }

      return {
        status: 'ok',
        detail: `${total}封邮件，${unread}封未读，无需特别关注`
      };
    } finally {
      lock.release();
    }
  } catch (err) {
    return { status: 'error', detail: `IMAP error: ${err.message}` };
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = { checkInbox };
