// utils/whatsapp.js — Meta Cloud API (WhatsApp Business) production integration
//
// Free tier: 1,000 user-initiated conversations/month at no cost.
// Outbound (proactive) messages — reminders, skip alerts — REQUIRE pre-approved
// message templates registered in Meta Business Manager.
//
// Setup steps:
//   1. developers.facebook.com → My Apps → Create App → Business type
//   2. Add "WhatsApp" product to your app
//   3. Copy Phone Number ID + Temporary Access Token to .env
//   4. For production: generate a permanent System User token in Business Settings
//   5. Register message templates at business.facebook.com/wa/manage/message-templates
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

const axios = require('axios');

const GRAPH_API_BASE   = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN     = process.env.WHATSAPP_ACCESS_TOKEN;

// ── Plan gate: which message types each plan allows ───────────────────────────
//   free     → no WhatsApp at all (only console log)
//   basic    → confirmation messages only
//   premium  → all message types
const PLAN_GATES = {
  free:    [],
  basic:   ['confirmation'],
  premium: ['confirmation', 'reminder', 'skip', 'reschedule']
};

// ── Normalize phone to international digits only ───────────────────────────────
// Meta requires format: 919876543210 (no +, no spaces, no dashes)
function normalizePhone(phone) {
  return phone.replace(/[^\d]/g, '');
}

// ── Core send function ────────────────────────────────────────────────────────
// @param phone       {string} - Any international phone format (+91..., 91..., etc.)
// @param message     {string} - Text message body (max 4096 chars)
// @param clinicPlan  {string} - 'free' | 'basic' | 'premium'
// @param messageType {string} - 'confirmation' | 'reminder' | 'skip' | 'reschedule'
// @returns           {Promise<{success: boolean, data?: any, reason?: string, error?: any}>}
async function sendWhatsAppMessage(phone, message, clinicPlan = 'free', messageType = 'confirmation') {

  // ── Plan gate check ──────────────────────────────────────────────────────
  const allowed = PLAN_GATES[clinicPlan] || [];
  if (!allowed.includes(messageType)) {
    console.log(
      `[WhatsApp] ⏭  PLAN_GATE blocked — plan:'${clinicPlan}' does not allow '${messageType}'. ` +
      `Phone: ${phone}`
    );
    return { success: false, reason: 'plan_not_allowed' };
  }

  const to = normalizePhone(phone);

  // ── Credentials check ────────────────────────────────────────────────────
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn(
      '[WhatsApp] ⚠  WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set in .env.\n' +
      `           Logging message instead → TO: ${to} | TYPE: ${messageType} | MSG: ${message}`
    );
    return { success: true, reason: 'logged_only_no_credentials' };
  }

  // ── Build payload ────────────────────────────────────────────────────────
  // NOTE: For proactive outbound messages (reminders, skip alerts), Meta requires
  // approved template messages. For free-form text (within 24h customer window), use 'text' type.
  // Switching between text / template: change `type` and body below accordingly.
  // Template example (uncomment when templates are approved):
  //   type: 'template',
  //   template: {
  //     name: 'appointment_reminder',
  //     language: { code: 'en_US' },
  //     components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }]
  //   }
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body:        message
    }
  };

  // ── Send request ─────────────────────────────────────────────────────────
  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type':  'application/json'
        },
        timeout: 10000   // 10-second timeout
      }
    );

    const waMessageId = response.data?.messages?.[0]?.id || 'unknown';
    console.log(`[WhatsApp] ✅ Sent — to:${to} type:${messageType} waId:${waMessageId}`);
    return { success: true, data: response.data };

  } catch (err) {
    // Extract Meta error details when available
    const metaError = err.response?.data?.error || err.message;
    console.error(
      `[WhatsApp] ❌ Failed — to:${to} type:${messageType}`,
      JSON.stringify(metaError, null, 2)
    );
    // Non-throwing: caller decides what to do with the result
    return { success: false, error: metaError };
  }
}

module.exports = { sendWhatsAppMessage };