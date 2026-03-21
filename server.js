import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const port = parseInt(process.env.PORT || '8080', 10);
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
/** Public origin users see in the browser (e.g. https://app.example.com or http://localhost:5173). */
const appOrigin = (process.env.APP_ORIGIN || `http://localhost:${port}`).replace(/\/$/, '');

const stripe = stripeSecret && stripePriceId ? new Stripe(stripeSecret) : null;

/**
 * Map Stripe subscription.status to app SubscriptionStatus.
 * @param {string | undefined} subStatus
 * @returns {'none' | 'trialing' | 'active' | 'past_due' | 'canceled'}
 */
function subscriptionStatusFromStripe(subStatus) {
  switch (subStatus) {
    case 'trialing':
    case 'active':
    case 'past_due':
      return subStatus;
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled';
    case 'incomplete':
    case 'paused':
    default:
      return 'none';
  }
}

// Stripe webhooks require the raw body for signature verification.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe || !webhookSecret) {
      return res.status(503).send('Webhook not configured');
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).send('Missing stripe-signature');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          console.log('[billing] checkout.session.completed', session.id);
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          console.log('[billing]', event.type, sub.id, sub.status);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error('[billing] webhook handler error', e);
      return res.status(500).json({ error: 'handler_failed' });
    }

    res.json({ received: true });
  }
);

app.use(express.json());

app.post('/api/billing/create-checkout-session', async (req, res) => {
  if (!stripe || !stripePriceId) {
    return res.status(503).json({
      error: 'Billing not configured',
      code: 'BILLING_DISABLED',
    });
  }

  try {
    const email =
      req.body && typeof req.body.email === 'string' ? req.body.email.trim().slice(0, 320) : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${appOrigin}/?billing_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?billing_canceled=1`,
      allow_promotion_codes: true,
      ...(email ? { customer_email: email } : {}),
    });

    if (!session.url) {
      return res.status(500).json({ error: 'No session URL from Stripe' });
    }

    return res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    return res.status(500).json({
      error: 'Checkout failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get('/api/billing/checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured', code: 'BILLING_DISABLED' });
  }

  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    const sub = session.subscription;
    if (!sub || typeof sub === 'string') {
      return res.json({
        status: 'none',
        sessionStatus: session.status,
      });
    }

    const status = subscriptionStatusFromStripe(sub.status);
    return res.json({
      status,
      subscriptionId: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    });
  } catch (e) {
    console.error('checkout-session retrieve error:', e);
    return res.status(500).json({ error: 'Failed to load session' });
  }
});

// Production: serve from dist/ (Vite output). Local dev: serve from project root.
const distDir = path.join(__dirname, 'dist');
const staticDir = existsSync(distDir) ? distDir : __dirname;

app.use(express.static(staticDir));

// Rewrite /Privacy-Policy and /Terms-of-Service to their .html files (matches firebase.json)
app.get('/Privacy-Policy', (_req, res) => {
  res.sendFile(path.join(staticDir, 'Privacy-Policy.html'));
});
app.get('/Terms-of-Service', (_req, res) => {
  res.sendFile(path.join(staticDir, 'Terms-of-Service.html'));
});

// SPA: all other routes -> index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app
  .listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
    if (!stripe) {
      console.warn(
        '[billing] Stripe disabled: set STRIPE_SECRET_KEY and STRIPE_PRICE_ID to enable checkout.'
      );
    } else {
      console.log(`[billing] APP_ORIGIN=${appOrigin} (success/cancel URLs)`);
    }
  })
  .on('error', (err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
