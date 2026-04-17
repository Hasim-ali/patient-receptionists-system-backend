// routes/index.js — All API routes with Swagger @swagger JSDoc annotations
const express  = require('express');
const router   = express.Router();
const { authenticate, authorize, clinicScope } = require('../middleware/auth');

const { login, createUser, getMe }                                                = require('../controllers/authController');
const { getClinics, getClinicById, createClinic, updateClinic, deleteClinic }     = require('../controllers/clinicController');
const { getDoctors, lookupDoctors, getDoctorById, createDoctor, updateDoctor, deleteDoctor } = require('../controllers/doctorController');
const { getPatients, getPatientById, createOrGetPatient, updatePatient, deletePatient }      = require('../controllers/patientController');
const { bookAppointment, markVisited, rescheduleConfirm, getAppointments }        = require('../controllers/appointmentController');

// =============================================================================
// AUTH
// =============================================================================

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get JWT token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/auth/login', login);

/**
 * @swagger
 * /api/auth/create-user:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new user (super_admin creates any role; clinic_admin creates receptionist only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserInput'
 *     responses:
 *       201:
 *         description: User created
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Email already exists
 */
router.post('/auth/create-user', authenticate, authorize('super_admin', 'clinic_admin'), createUser);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user's profile
 *     responses:
 *       200:
 *         description: Current user
 *       401:
 *         description: Unauthorized
 */
router.get('/auth/me', authenticate, getMe);

// =============================================================================
// CLINICS
// =============================================================================

/**
 * @swagger
 * /api/clinics:
 *   get:
 *     tags: [Clinics]
 *     summary: List clinics (super_admin gets all; others get only their own)
 *     parameters:
 *       - in: query
 *         name: clinic_id
 *         schema:
 *           type: integer
 *         description: Filter by clinic ID (super_admin only)
 *     responses:
 *       200:
 *         description: List of clinics
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Clinic'
 */
router.get('/clinics', authenticate, clinicScope, getClinics);

/**
 * @swagger
 * /api/clinics/{id}:
 *   get:
 *     tags: [Clinics]
 *     summary: Get a single clinic by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Clinic object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Clinic'
 *       404:
 *         description: Not found
 */
router.get('/clinics/:id', authenticate, getClinicById);

/**
 * @swagger
 * /api/clinics:
 *   post:
 *     tags: [Clinics]
 *     summary: Create a new clinic (super_admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClinicInput'
 *     responses:
 *       201:
 *         description: Clinic created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Clinic'
 *       403:
 *         description: Forbidden
 */
router.post('/clinics', authenticate, authorize('super_admin'), createClinic);

/**
 * @swagger
 * /api/clinics/{id}:
 *   patch:
 *     tags: [Clinics]
 *     summary: Update clinic fields (super_admin only — partial update)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClinicInput'
 *     responses:
 *       200:
 *         description: Updated clinic
 *       404:
 *         description: Not found
 */
router.patch('/clinics/:id', authenticate, authorize('super_admin'), updateClinic);

/**
 * @swagger
 * /api/clinics/{id}:
 *   delete:
 *     tags: [Clinics]
 *     summary: Soft-delete a clinic (super_admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Clinic soft-deleted
 *       404:
 *         description: Not found
 */
router.delete('/clinics/:id', authenticate, authorize('super_admin'), deleteClinic);

// =============================================================================
// DOCTORS
// =============================================================================

/**
 * @swagger
 * /api/doctors/lookup:
 *   get:
 *     tags: [Doctors]
 *     summary: Search/filter doctors; use dropdown=true for lightweight <select> lists
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Partial name search (LIKE)
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Partial specialization search (LIKE)
 *       - in: query
 *         name: clinic_id
 *         schema:
 *           type: integer
 *         description: Filter by clinic (super_admin only; others auto-scoped)
 *       - in: query
 *         name: dropdown
 *         schema:
 *           type: boolean
 *         description: If true, returns minimal fields (id, name, specialization, clinic)
 *     responses:
 *       200:
 *         description: Matching doctors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Doctor'
 */
router.get('/doctors/lookup', authenticate, clinicScope, lookupDoctors);

/**
 * @swagger
 * /api/doctors:
 *   get:
 *     tags: [Doctors]
 *     summary: List all doctors (clinic-scoped)
 *     parameters:
 *       - in: query
 *         name: clinic_id
 *         schema:
 *           type: integer
 *         description: Filter by clinic (super_admin only)
 *     responses:
 *       200:
 *         description: List of doctors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Doctor'
 */
router.get('/doctors', authenticate, clinicScope, getDoctors);

/**
 * @swagger
 * /api/doctors/{id}:
 *   get:
 *     tags: [Doctors]
 *     summary: Get a doctor by ID (includes availability schedule)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Doctor with availability
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 *       404:
 *         description: Not found
 */
router.get('/doctors/:id', authenticate, clinicScope, getDoctorById);

/**
 * @swagger
 * /api/doctors:
 *   post:
 *     tags: [Doctors]
 *     summary: Create a doctor (super_admin or clinic_admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DoctorInput'
 *           example:
 *             clinic_id: 1
 *             name: "Dr. Anjali Mehta"
 *             phone: "+919876500000"
 *             email: "dr.anjali@clinic.com"
 *             specialization: "Neurologist"
 *             qualification: "MBBS, DM (Neurology)"
 *             bio: "Expert in neurological disorders."
 *             available_days: "Mon,Tue,Thu"
 *             availability:
 *               - day_of_week: "Mon"
 *                 start_time: "09:00"
 *                 end_time: "16:00"
 *               - day_of_week: "Tue"
 *                 start_time: "09:00"
 *                 end_time: "16:00"
 *               - day_of_week: "Thu"
 *                 start_time: "10:00"
 *                 end_time: "14:00"
 *     responses:
 *       201:
 *         description: Doctor created
 *       403:
 *         description: Forbidden
 */
router.post('/doctors', authenticate, authorize('super_admin', 'clinic_admin'), clinicScope, createDoctor);

/**
 * @swagger
 * /api/doctors/{id}:
 *   patch:
 *     tags: [Doctors]
 *     summary: Update doctor details and/or availability (super_admin or clinic_admin)
 *     description: If `availability` array is supplied, existing schedule is replaced entirely.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DoctorInput'
 *     responses:
 *       200:
 *         description: Updated doctor
 *       404:
 *         description: Not found
 */
router.patch('/doctors/:id', authenticate, authorize('super_admin', 'clinic_admin'), clinicScope, updateDoctor);

/**
 * @swagger
 * /api/doctors/{id}:
 *   delete:
 *     tags: [Doctors]
 *     summary: Soft-delete a doctor (super_admin or clinic_admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Doctor soft-deleted
 *       404:
 *         description: Not found
 */
router.delete('/doctors/:id', authenticate, authorize('super_admin', 'clinic_admin'), clinicScope, deleteDoctor);

// =============================================================================
// PATIENTS
// =============================================================================

/**
 * @swagger
 * /api/patients:
 *   get:
 *     tags: [Patients]
 *     summary: List patients (clinic-scoped)
 *     responses:
 *       200:
 *         description: List of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Patient'
 */
router.get('/patients', authenticate, clinicScope, getPatients);

/**
 * @swagger
 * /api/patients/{id}:
 *   get:
 *     tags: [Patients]
 *     summary: Get patient by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Patient object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Patient'
 *       404:
 *         description: Not found
 */
router.get('/patients/:id', authenticate, clinicScope, getPatientById);

/**
 * @swagger
 * /api/patients:
 *   post:
 *     tags: [Patients]
 *     summary: Create patient or return existing (idempotent by phone + clinic)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatientInput'
 *     responses:
 *       201:
 *         description: Patient created
 *       200:
 *         description: Patient already exists — returned as-is
 *       400:
 *         description: Validation error
 */
router.post('/patients', authenticate, clinicScope, createOrGetPatient);

/**
 * @swagger
 * /api/patients/{id}:
 *   patch:
 *     tags: [Patients]
 *     summary: Update patient (super_admin or clinic_admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatientInput'
 *     responses:
 *       200:
 *         description: Updated patient
 *       404:
 *         description: Not found
 */
router.patch('/patients/:id', authenticate, authorize('super_admin', 'clinic_admin'), clinicScope, updatePatient);

/**
 * @swagger
 * /api/patients/{id}:
 *   delete:
 *     tags: [Patients]
 *     summary: Soft-delete a patient (super_admin or clinic_admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Patient soft-deleted
 *       404:
 *         description: Not found
 */
router.delete('/patients/:id', authenticate, authorize('super_admin', 'clinic_admin'), clinicScope, deletePatient);

// =============================================================================
// APPOINTMENTS
// =============================================================================

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments (clinic-scoped, newest first)
 *     responses:
 *       200:
 *         description: List of appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Appointment'
 */
router.get('/appointments', authenticate, clinicScope, getAppointments);

/**
 * @swagger
 * /api/book-appointment:
 *   post:
 *     tags: [Appointments]
 *     summary: Book appointment — auto-selects first free slot; sends WhatsApp confirmation (if clinic plan allows)
 *     description: |
 *       Slot selection logic:
 *       1. Checks `available_days` on doctor — rejects if date falls on a day the doctor doesn't work
 *       2. Checks `doctor_availability` table for working hours on that day (defaults to 09:00–16:30 if no record)
 *       3. Picks the first unboooked 30-minute slot
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient_id, doctor_id, appointment_date]
 *             properties:
 *               patient_id:
 *                 type: integer
 *               doctor_id:
 *                 type: integer
 *               appointment_date:
 *                 type: string
 *                 format: date
 *                 example: "2025-02-10"
 *     responses:
 *       200:
 *         description: Appointment booked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Appointment'
 *       409:
 *         description: No free slots available
 */
router.post('/book-appointment', authenticate, clinicScope, bookAppointment);

/**
 * @swagger
 * /api/mark-visited/{id}:
 *   post:
 *     tags: [Appointments]
 *     summary: Mark appointment as visited — stops skip detection for this record
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Marked as visited
 *       404:
 *         description: Appointment not found
 */
router.post('/mark-visited/:id', authenticate, clinicScope, markVisited);

/**
 * @swagger
 * /api/reschedule-confirm:
 *   post:
 *     tags: [Appointments]
 *     summary: Confirm or decline patient's reschedule request (for skipped appointments)
 *     description: |
 *       When patient responds YES to the skip WhatsApp message, receptionist calls this API.
 *       System finds next free slot across the next 30 days and books it.
 *       WhatsApp confirmation is sent if clinic plan allows (basic or premium).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointment_id, response]
 *             properties:
 *               appointment_id:
 *                 type: integer
 *                 description: ID of the skipped appointment
 *               response:
 *                 type: string
 *                 enum: [yes, no]
 *     responses:
 *       200:
 *         description: Rescheduled or declined
 *       404:
 *         description: Skipped appointment not found
 *       409:
 *         description: No free slots in next 30 days
 */
router.post('/reschedule-confirm', authenticate, clinicScope, rescheduleConfirm);

module.exports = router;