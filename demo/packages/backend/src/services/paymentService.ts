interface ChargeParams {
  amount: number;
  currency: string;
  customerId: string;
  description: string;
}

interface ChargeResult {
  id: string;
  status: 'succeeded' | 'failed';
}

async function charge(params: ChargeParams): Promise<ChargeResult> {
  const res = await fetch('https://api.payment-provider.example/charges', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PAYMENT_SECRET_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Payment failed: ${res.status}`);
  return res.json() as Promise<ChargeResult>;
}

async function refund(chargeId: string, amount?: number): Promise<void> {
  await fetch(`https://api.payment-provider.example/refunds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PAYMENT_SECRET_KEY}`,
    },
    body: JSON.stringify({ charge: chargeId, amount }),
  });
}

export const paymentService = { charge, refund };
