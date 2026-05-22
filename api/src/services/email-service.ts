import { createRequire } from 'node:module';
import logger from '../utils/logger.js';

const _require = createRequire(import.meta.url);

function getSiteUrl(): string {
  const url = process.env.SITE_URL || process.env.CORS_ORIGIN?.split(',')[0].trim() || 'http://localhost:8080';
  return url.replace(/\/$/, '');
}

async function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const nodemailer = _require('nodemailer');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export async function sendBugReportNotification(report: {
  id: number;
  title: string;
  description: string;
  username: string;
  createdAt: Date;
}): Promise<void> {
  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    logger.warn('CONTACT_EMAIL missing — skipping admin bug report notification', { module: 'Email' });
    return;
  }

  const transporter = await createTransporter();
  if (!transporter) {
    logger.warn('SMTP not configured — skipping admin bug report notification', { module: 'Email' });
    return;
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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
        `View in admin panel: ${getSiteUrl()}/admin/bug-reports`,
      ].join('\n'),
      html: `
        <h2 style="color:#0891b2">Bug report #${report.id}</h2>
        <p><strong>From:</strong> ${report.username}<br>
        <strong>Date:</strong> ${report.createdAt.toLocaleString('fr-FR')}</p>
        <hr>
        <h3>${report.title}</h3>
        <p style="white-space:pre-wrap">${report.description}</p>
        <hr>
        <p><a href="${getSiteUrl()}/admin/bug-reports">View in admin panel</a></p>
      `,
    });
    logger.info(`Bug report admin email sent for report #${report.id}`, { module: 'Email' });
  } catch (e: any) {
    logger.error(`Failed to send bug report admin email: ${e.message}`, { module: 'Email' });
  }
}

export async function sendBugReportAcknowledgment(to: string, report: { id: number; title: string }): Promise<void> {
  const transporter = await createTransporter();
  if (!transporter) {
    logger.warn('SMTP not configured — skipping bug report acknowledgment', { module: 'Email' });
    return;
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transporter.sendMail({
      from,
      to,
      subject: `[Starvis] Your bug report #${report.id} has been received`,
      text: [
        'Thank you for your bug report!',
        '',
        `We have received your report #${report.id}: "${report.title}".`,
        'Our team will review it as soon as possible.',
        '',
        `You can track the status of your reports at: ${getSiteUrl()}/my-reports`,
        '',
        '— The Starvis team',
      ].join('\n'),
      html: `
        <h2 style="color:#0891b2">Your bug report has been received</h2>
        <p>Thank you for taking the time to report an issue!</p>
        <p>We have received your report <strong>#${report.id}: "${report.title}"</strong>.<br>
        Our team will review it as soon as possible.</p>
        <p><a href="${getSiteUrl()}/my-reports">Track your reports</a></p>
        <p style="color:#64748b;font-size:12px">— The Starvis team</p>
      `,
    });
    logger.info(`Bug report acknowledgment sent to ${to} for report #${report.id}`, { module: 'Email' });
  } catch (e: any) {
    logger.error(`Failed to send bug report acknowledgment: ${e.message}`, { module: 'Email' });
  }
}

export async function sendVerificationEmail(to: string, username: string, token: string): Promise<void> {
  const transporter = await createTransporter();
  if (!transporter) {
    logger.warn('SMTP not configured — skipping verification email', { module: 'Email' });
    return;
  }

  const link = `${getSiteUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transporter.sendMail({
      from,
      to,
      subject: '[Starvis] Verify your email address',
      text: [
        `Hello ${username},`,
        '',
        'Please verify your email address by clicking the link below:',
        link,
        '',
        'This link is valid for 48 hours.',
        'If you did not create a Starvis account, you can ignore this email.',
        '',
        '— The Starvis team',
      ].join('\n'),
      html: `
        <h2 style="color:#0891b2">Verify your email address</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>Please click the button below to verify your email and activate your Starvis account.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#0e7490;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-family:monospace">
            VERIFY MY EMAIL
          </a>
        </p>
        <p style="color:#64748b;font-size:12px">This link is valid for 48 hours. If you did not create a Starvis account, ignore this email.</p>
      `,
    });
    logger.info(`Verification email sent to ${to}`, { module: 'Email' });
  } catch (e: any) {
    logger.error(`Failed to send verification email: ${e.message}`, { module: 'Email' });
  }
}

export async function sendPasswordResetEmail(to: string, username: string, token: string): Promise<void> {
  const transporter = await createTransporter();
  if (!transporter) {
    logger.warn('SMTP not configured — skipping password reset email', { module: 'Email' });
    return;
  }

  const link = `${getSiteUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transporter.sendMail({
      from,
      to,
      subject: '[Starvis] Reset your password',
      text: [
        `Hello ${username},`,
        '',
        'We received a request to reset your Starvis password.',
        'Click the link below to set a new password:',
        link,
        '',
        'This link is valid for 1 hour.',
        'If you did not request a password reset, you can safely ignore this email.',
        '',
        '— The Starvis team',
      ].join('\n'),
      html: `
        <h2 style="color:#0891b2">Reset your password</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>We received a request to reset your Starvis password. Click the button below to choose a new one.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#0e7490;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-family:monospace">
            RESET MY PASSWORD
          </a>
        </p>
        <p style="color:#64748b;font-size:12px">This link is valid for 1 hour. If you did not request this, ignore this email — your password has not changed.</p>
      `,
    });
    logger.info(`Password reset email sent to ${to}`, { module: 'Email' });
  } catch (e: any) {
    logger.error(`Failed to send password reset email: ${e.message}`, { module: 'Email' });
  }
}
