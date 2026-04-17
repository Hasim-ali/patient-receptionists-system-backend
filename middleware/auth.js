// middleware/auth.js — JWT authentication + role authorization + clinic scoping

const jwt = require('jsonwebtoken');

// ── 1. authenticate ────────────────────────────────────────────────────────────
// Verifies Bearer token. Attaches decoded payload to req.user.
// Payload shape: { id, name, role, clinic_id }
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed. Expected: Bearer <token>' });
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.log(err,"err")
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

// ── 2. authorize ───────────────────────────────────────────────────────────────
// Middleware factory. Pass allowed roles as arguments.
// Usage: authorize('super_admin', 'clinic_admin')
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role(s): ${roles.join(' | ')}. Your role: ${req.user.role}`
      });
    }
    next();
  };
}

// ── 3. clinicScope ─────────────────────────────────────────────────────────────
// Sets req.scopedClinicId so controllers only return data for the correct clinic.
//   super_admin  → req.scopedClinicId = null (unrestricted)
//                  optionally pass ?clinic_id=X query param to filter a single clinic
//   clinic_admin → req.scopedClinicId = their own clinic_id (forced)
//   receptionist → req.scopedClinicId = their own clinic_id (forced)
function clinicScope(req, res, next) {
  if (req.user.role === 'super_admin') {
    req.scopedClinicId = req.query.clinic_id ? parseInt(req.query.clinic_id) : null;
  } else {
    req.scopedClinicId = req.user.clinic_id;
  }
  next();
}

module.exports = { authenticate, authorize, clinicScope };