const db = require('../db');

// GET /api/doctors — list all doctors
async function getDoctors(req, res) {
  try {
    const [rows] = await db.query('SELECT id, name, phone FROM doctors');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getDoctors };