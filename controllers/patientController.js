const db = require('../db');

// POST /api/patients — create or fetch patient by phone
async function createOrGetPatient(req, res) {
  const { name, phone, subscription } = req.body;

  if (!name || !phone || !subscription) {
    return res.status(400).json({ error: 'name, phone, and subscription are required' });
  }
  if (!['basic', 'premium'].includes(subscription)) {
    return res.status(400).json({ error: 'subscription must be basic or premium' });
  }

  try {
    // Check if patient already exists by phone
    const [existing] = await db.query('SELECT * FROM patients WHERE phone = ?', [phone]);
    if (existing.length > 0) {
      return res.status(200).json({ patient: existing[0], created: false });
    }
    const [result] = await db.query(
      'INSERT INTO patients (name, phone, subscription) VALUES (?, ?, ?)',
      [name, phone, subscription]
    );
    const [newPatient] = await db.query('SELECT * FROM patients WHERE id = ?', [result.insertId]);
    return res.status(201).json({ patient: newPatient[0], created: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createOrGetPatient };