// whatsapp.js — WhatsApp message sender placeholder
// TODO: replace with actual WhatsApp API integration when provider is specified

function sendWhatsAppMessage(phone, message) {
  console.log(`[WhatsApp] TO: ${phone} | MESSAGE: ${message}`);
  // Replace the line above with real API call to your chosen provider
  return Promise.resolve({ success: true });
}

module.exports = { sendWhatsAppMessage };