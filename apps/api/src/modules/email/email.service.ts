import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface OrderEmailItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderEmailData {
  orderNumber: string;
  total: number;
  currency: string;
  items: OrderEmailItem[];
}

/**
 * Very small token interpolation for the email templates. Only `{{token}}`
 * placeholders are replaced. Substituted values are HTML-escaped by default so
 * user/supplier-supplied names and order data can never break out of the
 * markup. Values in `rawVars` are trusted pre-escaped HTML and are injected
 * verbatim (used for the line-item table), so only builder-produced markup
 * goes through this path. See `templates/` for the source markup.
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
  rawVars: Record<string, string> = {},
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    if (rawVars[name] != null) return rawVars[name];
    const value = vars[name];
    return value == null ? '' : escapeHtml(value);
  });
}

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a runtime value so it is safe to embed in HTML email markup. */
function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (ch) => htmlEscapes[ch]);
}

/** Render a money amount as `2999.00` (no currency symbol/code, no grouping). */
function formatAmount(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** Build the `<tr>` rows for the order confirmation line-item table. */
function buildItemsRows(items: OrderEmailItem[]): string {
  return items
    .map((item) => {
      return (
        `<tr>` +
        `<td align="left" style="padding:10px;border-bottom:1px solid #f0ebe4;font-size:14px;color:#2b2620;">${escapeHtml(item.productName)}</td>` +
        `<td align="center" style="padding:10px;border-bottom:1px solid #f0ebe4;font-size:14px;color:#6b635a;">${item.quantity}</td>` +
        `<td align="right" style="padding:10px;border-bottom:1px solid #f0ebe4;font-size:14px;color:#2b2620;">${formatAmount(item.unitPrice)}</td>` +
        `</tr>`
      );
    })
    .join('');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string | undefined;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly webUrl: string;

  private readonly verificationTemplate: string;
  private readonly passwordResetTemplate: string;
  private readonly orderConfirmationTemplate: string;

  constructor() {
    this.apiKey = process.env.EMAIL_API_KEY;
    this.fromEmail = process.env.EMAIL_FROM ?? 'noreply@aurevo.store';
    this.fromName = process.env.EMAIL_FROM_NAME ?? 'AUREVO';
    this.webUrl = process.env.WEB_URL ?? 'http://localhost:5173';

    const templatesDir = path.join(__dirname, 'templates');
    this.verificationTemplate = this.loadTemplate(templatesDir, 'verification.html');
    this.passwordResetTemplate = this.loadTemplate(templatesDir, 'password-reset.html');
    this.orderConfirmationTemplate = this.loadTemplate(templatesDir, 'order-confirmation.html');

    if (!this.apiKey) {
      this.logger.warn('EMAIL_API_KEY not set — emails will be logged but not sent');
    }
  }

  /**
   * Read a template file from disk. Compiles to `dist/modules/email/templates`
   * next to this file (see nest-cli assets), so __dirname works in both dev
   * and the production Docker image. A missing file is fatal — templates are
   * build-time assets, so falling back silently would ship broken emails.
   */
  private loadTemplate(dir: string, file: string): string {
    return fs.readFileSync(path.join(dir, file), 'utf8');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/verify-email?token=${token}`;
    const html = renderTemplate(this.verificationTemplate, { verifyUrl });
    await this.send(to, 'Verify your AUREVO email', html);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.webUrl}/reset-password?token=${token}`;
    const html = renderTemplate(this.passwordResetTemplate, { resetUrl });
    await this.send(to, 'Reset your AUREVO password', html);
  }

  async sendOrderConfirmation(to: string, order: OrderEmailData): Promise<void> {
    const orderUrl = `${this.webUrl}/orders?orderNumber=${order.orderNumber}`;
    const html = renderTemplate(
      this.orderConfirmationTemplate,
      {
        orderUrl,
        total: formatAmount(order.total),
        currency: order.currency,
      },
      {
        orderNumber: order.orderNumber,
        itemsRows: buildItemsRows(order.items),
      },
    );
    await this.send(to, `AUREVO Order ${order.orderNumber}`, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`[EMAIL-NOOP] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: [to],
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Email send failed (${res.status}): ${body}`);
      }
    } catch (err) {
      this.logger.error('Email send error', err);
    }
  }
}