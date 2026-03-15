import { config } from '../config';

interface Order {
  id: string;
  user_id: string;
  total: number;
}

async function send(to: string, subject: string, html: string) {
  if (config.nodeEnv === 'development') {
    console.log(`[email] to=${to} subject="${subject}"`);
    return;
  }
  // Production: forward to transactional email provider
  await fetch('https://api.email-provider.example/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to, subject, html }),
  });
}

async function sendOrderConfirmation(order: Order) {
  await send(
    `user-${order.user_id}@acme.example.com`,
    `Order #${order.id} confirmed`,
    `<p>Thanks for your order! Total: $${order.total}</p>`
  );
}

async function sendPasswordReset(email: string, token: string) {
  const link = `${config.frontendUrl}/reset-password?token=${token}`;
  await send(email, 'Reset your password', `<p><a href="${link}">Reset password</a></p>`);
}

export const emailService = { send, sendOrderConfirmation, sendPasswordReset };
