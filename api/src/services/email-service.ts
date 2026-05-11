import { createRequire } from 'node:module';
import logger from '../utils/logger.js';

const _require = createRequire(import.meta.url);

export async function sendBugReportNotification(report: {
  id: number;
  title: string;
  description: string;
  username: string;
  createdAt: Date;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.CONTACT_EMAIL;

  if (!host || !user || !pass || !to) {
    logger.warn('Email not configured (SMTP_HOST/USER/PASS/CONTACT_EMAIL missing) — skipping notification', { module: 'Email' });
    return;
  }

  try {
    const nodemailer = _require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const from = process.env.SMTP_FROM || user;
    await transporter.sendMail({
      from,
      to,
      subject: `[Starvis] Bug report #${report.id}: ${report.title}`,
      text: [
        'New bug report submitted on Starvis.',
        '',
        `Report #${report.id}`,
        `From: ${report.username}`,
        `Date: ${report.createdAt.toISOString()}`,
        '',
        `Title: ${report.title}`,
        '',
        'Description:',
        report.description,
        '',
        'View in admin panel: /admin/bug-reports',
      ].join('\n'),
      html: `
        <h2 style="color:#0891b2">Bug report #${report.id}</h2>
        <p><strong>From:</strong> ${report.username}<br>
        <strong>Date:</strong> ${report.createdAt.toLocaleString('fr-FR')}</p>
        <hr>
        <h3>${report.title}</h3>
        <p style="white-space:pre-wrap">${report.description}</p>
        <hr>
        <p><a href="/admin/bug-reports">View in admin panel</a></p>
      `,
    });
    logger.info(`Bug report email sent for report #${report.id}`, { module: 'Email' });
  } catch (e: any) {
    logger.error(`Failed to send bug report email: ${e.message}`, { module: 'Email' });
  }
}
