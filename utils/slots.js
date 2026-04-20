// slots.js — Generates 30-minute time slots from 09:00 to 16:30
// Working hours default (not specified in project); adjust if needed.

function generateSlots() {
  const slots = [];
  for (let h = 9; h <= 16; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00:00`);
    if (h < 17) slots.push(`${String(h).padStart(2,'0')}:30:00`);
  }
  // Produces: 09:00, 09:30 ... 16:00, 16:30
  return slots;
}

module.exports = { generateSlots };