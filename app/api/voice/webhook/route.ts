import { NextRequest, NextResponse } from 'next/server';
import { doctors } from '@/lib/doctors';
import { saveAppointment, getConversation } from '@/lib/db';
import { sendAppointmentEmail } from '@/lib/email';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    console.log('[webhook] raw body:', text);

    if (!text || text.trim() === '') {
      console.log('[webhook] empty body received');
      return NextResponse.json({ received: true });
    }

    const body = JSON.parse(text);
    console.log('[webhook] parsed body:', JSON.stringify(body));

    const { tool, parameters, input } = body;
    const params_resolved = parameters ?? input;

    // sessionId is embedded in the URL query string since Bland.ai
    // does not forward call-level metadata to tool webhook calls
    const sessionId = req.nextUrl.searchParams.get('sessionId') ?? body.metadata?.sessionId ?? null;
    console.log('[webhook] sessionId from URL:', sessionId);

    // Call completion event — Bland.ai sends this after the call ends with no `tool` field.
    // disposition_tag === 'COMPLETED_ACTION' means the AI successfully booked an appointment.
    if (!tool && body.disposition_tag === 'COMPLETED_ACTION' && body.metadata?.sessionId) {
      console.log('[webhook] call completion — COMPLETED_ACTION, processing email');
      return handleCallCompletion(body);
    }

    switch (tool) {
      case 'check_availability':
        return handleCheckAvailability(params_resolved);

      case 'book_appointment':
        return handleBookAppointment(params_resolved, sessionId);

      default:
        console.log('[webhook] unknown tool:', tool);
        return NextResponse.json({ received: true });
    }
    
  } catch (error) {
    console.error('[webhook] error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

async function handleCallCompletion(body: any) {
  const sessionId = body.metadata?.sessionId ?? null;
  const doctorId  = Number(body.metadata?.doctorId ?? body.variables?.input?.doctorId ?? 0);
  const summary   = body.summary ?? body.concatenated_transcript ?? '';

  // Look up stored patient — has guaranteed email, full name, DOB
  let storedPatient = null;
  if (sessionId) {
    const conversation = await getConversation(sessionId);
    storedPatient = conversation?.patient ?? null;
  }

  // Fall back to metadata fields if session lookup fails
  const email = storedPatient?.email ?? body.metadata?.patientEmail ?? null;

  if (!email) {
    console.error('[webhook] call completion — no email found, cannot send confirmation');
    return NextResponse.json({ received: true });
  }

  const patient = storedPatient ?? {
    firstName: body.metadata?.patientName?.split(' ')[0] ?? '',
    lastName:  body.metadata?.patientName?.split(' ').slice(1).join(' ') ?? '',
    email,
    phone: body.to ?? '',
    dob: '',
  };

  console.log('[webhook] call completion — patient:', patient.firstName, patient.email);

  // Find which slot was booked by matching the summary text against our slot database
  const doctor = doctors.find(d => d.id === doctorId);
  const slot   = doctor ? findSlotFromSummary(summary, doctor) : null;

  console.log('[webhook] call completion — matched slot:', slot?.id ?? 'none, using fallback');

  // Use reason from pendingBooking (stored in session) or a generic fallback
  let reason = 'Medical appointment';
  if (sessionId) {
    const conversation = await getConversation(sessionId);
    if (conversation?.pendingBooking?.reason) reason = conversation.pendingBooking.reason;
  }

  const appointment = {
    id: crypto.randomUUID(),
    patient,
    doctorId,
    doctorName: doctor?.name ?? '',
    specialty:  doctor?.specialty ?? '',
    slotId:     slot?.id ?? 'voice-booking',
    datetime:   slot ? slot.datetime.toISOString() : new Date().toISOString(),
    reason,
    createdAt:  new Date().toISOString(),
  };

  try {
    await saveAppointment(appointment);
    console.log('[webhook] call completion — appointment saved');
  } catch (dbErr) {
    console.error('[webhook] call completion — saveAppointment failed:', dbErr);
  }

  try {
    await sendAppointmentEmail(appointment);
    console.log('[webhook] call completion — email sent to:', email);
  } catch (emailErr) {
    console.error('[webhook] call completion — email failed:', emailErr);
  }

  return NextResponse.json({ received: true });
}

// Match a slot against the Bland.ai summary text.
// Summary example: "Tuesday, March 24th at 8:30 AM"
function findSlotFromSummary(summary: string, doctor: (typeof doctors)[0]): (typeof doctor.availability)[0] | null {
  const now   = new Date();
  const lower = summary.toLowerCase();
  const slots = doctor.availability.filter(s => s.available && s.datetime > now);

  for (const slot of slots) {
    const day   = slot.datetime.getDate();
    const hr    = slot.datetime.getHours();
    const min   = slot.datetime.getMinutes();
    const hr12  = hr % 12 || 12;
    const ampm  = hr < 12 ? 'am' : 'pm';

    const dayMatch = lower.includes(day.toString());

    const timeVariants = [
      `${hr12}:${min.toString().padStart(2, '0')} ${ampm}`,  // "8:30 am"
      `${hr12}:${min.toString().padStart(2, '0')}${ampm}`,   // "8:30am"
      ...(min === 0 ? [`${hr12} ${ampm}`, `${hr12}${ampm}`] : []), // "9 am" / "9am"
    ];

    const timeMatch = timeVariants.some(t => lower.includes(t));

    if (dayMatch && timeMatch) return slot;
  }

  return null;
}

function handleCheckAvailability(params: any) {
  const { doctorId, preferredDay } = params;
  const doctor = doctors.find(d => d.id === Number(doctorId));
  
  if (!doctor) {
    return NextResponse.json({ success: false, message: 'Doctor not found' });
  }

  const now = new Date();
  let slots = doctor.availability.filter(s => s.available && s.datetime > now);
  
  if (preferredDay) {
    const dayLower = preferredDay.toLowerCase();
    slots = slots.filter(s => {
      const dayName = format(s.datetime, 'EEEE').toLowerCase();
      return dayName.includes(dayLower);
    });
  }

  slots = slots.slice(0, 5);
  
  const formattedSlots = slots.map(s => ({
    id: s.id,
    time: format(s.datetime, 'EEEE, MMMM d \'at\' h:mm a')
  }));
  
  console.log('[webhook] check_availability returning slots:', formattedSlots);
  
  return NextResponse.json({
    success: true,
    doctor: doctor.name,
    slots: formattedSlots,
    message: formattedSlots.length > 0 
      ? `${doctor.name} has ${formattedSlots.length} available times: ${formattedSlots.map(s => s.time).join(', ')}`
      : `No available times found.`
  });
}

async function handleBookAppointment(params: any, sessionId: string | null) {
  console.log('[webhook] book_appointment params:', JSON.stringify(params));
  console.log('[webhook] sessionId:', sessionId);

  const { slotId, patientInfo, doctorId, reason } = params;

  // Look up the stored patient — Bland.ai never verbally collects email so
  // patientInfo.email is always missing. We retrieve it from the saved session.
  let storedPatient = null;
  if (sessionId) {
    const conversation = await getConversation(sessionId);
    storedPatient = conversation?.patient ?? null;
    console.log('[webhook] stored patient:', storedPatient?.firstName, storedPatient?.email);
  }

  // Stored patient is authoritative (has email); Bland.ai patientInfo fills any gaps
  const patient = storedPatient
    ? { ...patientInfo, ...storedPatient }
    : patientInfo;

  console.log('[webhook] resolved patient email:', patient?.email);

  const doctor = doctors.find(d => d.id === Number(doctorId));
  const slot = doctor?.availability.find(s => s.id === slotId);

  console.log('[webhook] found doctor:', doctor?.name, 'found slot:', slot?.id);

  const appointment = {
    id: crypto.randomUUID(),
    patient,
    doctorId: Number(doctorId),
    doctorName: doctor?.name || '',
    specialty: doctor?.specialty || '',
    slotId,
    datetime: slot ? slot.datetime.toISOString() : new Date().toISOString(),
    reason,
    createdAt: new Date().toISOString()
  };

  // Save and email are independent — a DB error must not block the email
  try {
    await saveAppointment(appointment);
    console.log('[webhook] appointment saved');
  } catch (dbErr) {
    console.error('[webhook] saveAppointment failed (continuing to email):', dbErr);
  }

  try {
    await sendAppointmentEmail(appointment);
    console.log('[webhook] email sent to:', patient?.email);
  } catch (emailErr) {
    console.error('[webhook] sendAppointmentEmail failed:', emailErr);
  }

  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    message: `Appointment booked with ${doctor?.name}. Confirmation email sent to ${patient?.email}.`
  });
}