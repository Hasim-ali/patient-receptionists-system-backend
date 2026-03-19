const express = require('express');
const router = express.Router();

const { getDoctors } = require('../controllers/doctorController');
const { createOrGetPatient } = require('../controllers/patientController');
const { bookAppointment, markVisited,
    rescheduleConfirm, getAppointments } = require('../controllers/appointmentController');

router.get('/doctors', getDoctors);
router.post('/patients', createOrGetPatient);
router.post('/book-appointment', bookAppointment);
router.get('/appointments', getAppointments);
router.post('/mark-visited/:id', markVisited);
router.post('/reschedule-confirm', rescheduleConfirm);

module.exports = router;