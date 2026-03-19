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
  const input = body.variables?.input;
  const { slotId, doctorId, reason, patientInfo } = input;

  // Prefer stored patient (has guaranteed email) over what Bland.ai sent
  let storedPatient = null;
  if (sessionId) {
    const conversation = await getConversation(sessionId);
    storedPatient = conversation?.patient ?? null;
  }

  const patient = storedPatient
    ? { ...patientInfo, ...storedPatient }
    : patientInfo;

  console.log('[webhook] call completion — patient email:', patient?.email);

  if (!patient?.email) {
    console.error('[webhook] call completion — no email found, cannot send confirmation');
    return NextResponse.json({ received: true });
  }

  const doctor = doctors.find(d => d.id === Number(doctorId));
  const now = new Date();
  const slot = doctor?.availability.find(s => s.id === slotId && s.datetime > now);

  const appointment = {
    id: crypto.randomUUID(),
    patient,
    doctorId: Number(doctorId),
    doctorName: doctor?.name || '',
    specialty: doctor?.specialty || '',
    slotId,
    datetime: slot ? slot.datetime.toISOString() : now.toISOString(),
    reason,
    createdAt: now.toISOString()
  };

  try {
    await saveAppointment(appointment);
    console.log('[webhook] call completion — appointment saved');
  } catch (dbErr) {
    console.error('[webhook] call completion — saveAppointment failed:', dbErr);
  }

  try {
    await sendAppointmentEmail(appointment);
    console.log('[webhook] call completion — email sent to:', patient.email);
  } catch (emailErr) {
    console.error('[webhook] call completion — email failed:', emailErr);
  }

  return NextResponse.json({ received: true });
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