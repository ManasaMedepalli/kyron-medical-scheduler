import { NextRequest, NextResponse } from 'next/server';
import { doctors } from '@/lib/doctors';
import { saveAppointment, getConversationByPhone } from '@/lib/db';
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
    
    const { tool, parameters, input, metadata } = body;
    const params_resolved = parameters ?? input;

    const callerPhone = body.from || body.caller || body.phone;
    if (callerPhone) {
      const prior = await getConversationByPhone(callerPhone);
      if (prior?.patient) {
        const p = prior.patient;
        console.log('[webhook] returning patient:', p.firstName, p.lastName);
      }
    }
    
    switch (tool) {
      case 'check_availability':
        return handleCheckAvailability(params_resolved);

      case 'book_appointment':
        return handleBookAppointment(params_resolved, metadata);
        
      default:
        console.log('[webhook] unknown tool:', tool, 'full body:', JSON.stringify(body));
        return NextResponse.json({ received: true, tool });
    }
    
  } catch (error) {
    console.error('[webhook] error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

function handleCheckAvailability(params: any) {
  const { doctorId, preferredDay } = params;
  const doctor = doctors.find(d => d.id === Number(doctorId));
  
  if (!doctor) {
    return NextResponse.json({ success: false, message: 'Doctor not found' });
  }

  let slots = doctor.availability.filter(s => s.available);
  
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

async function handleBookAppointment(params: any, metadata: any) {
  console.log('[webhook] book_appointment params:', JSON.stringify(params));
  
  const { slotId, patientInfo, doctorId, reason } = params;
  const doctor = doctors.find(d => d.id === Number(doctorId));
  const slot = doctor?.availability.find(s => s.id === slotId);
  
  console.log('[webhook] found doctor:', doctor?.name, 'found slot:', slot?.id);

  const appointment = {
    id: crypto.randomUUID(),
    patient: patientInfo,
    doctorId: Number(doctorId),
    doctorName: doctor?.name || '',
    specialty: doctor?.specialty || '',
    slotId,
    datetime: slot ? slot.datetime.toISOString() : new Date().toISOString(),
    reason,
    createdAt: new Date().toISOString()
  };
  
  await saveAppointment(appointment);
  await sendAppointmentEmail(appointment);
  
  console.log('[webhook] appointment saved and email sent');
  
  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    message: `Appointment booked with ${doctor?.name}. Confirmation email sent to ${patientInfo?.email}.`
  });
}