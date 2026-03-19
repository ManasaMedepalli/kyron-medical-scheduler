import { NextRequest, NextResponse } from 'next/server';
import { doctors, getAvailableSlots } from '@/lib/doctors';
import { saveAppointment, getConversationByPhone } from '@/lib/db';
import { sendAppointmentEmail } from '@/lib/email';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const { tool, parameters, metadata } = body;

    // Call-back memory: look up prior conversation by caller's phone
    const callerPhone = body.from || body.caller || body.phone;
    let priorContext = '';
    if (callerPhone) {
      const prior = await getConversationByPhone(callerPhone);
      if (prior?.patient) {
        const p = prior.patient;
        priorContext = `RETURNING PATIENT. Name: ${p.firstName} ${p.lastName}, DOB: ${p.dob}, Email: ${p.email}.`;
        if (prior.pendingBooking) {
          priorContext += ` Was scheduling with ${prior.pendingBooking.doctorName} for ${prior.pendingBooking.reason}. Had not confirmed a slot yet.`;
        }
      }
    }
    
    switch (tool) {
      case 'check_availability':
        return handleCheckAvailability(parameters);
        
      case 'book_appointment':
        return handleBookAppointment(parameters, metadata);
        
      default:
        return NextResponse.json({
          error: 'Unknown tool',
          context: priorContext || undefined
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

function handleCheckAvailability(params: any) {
  const { doctorId, preferredDay } = params;
  
  const slots = getAvailableSlots(doctorId, preferredDay);
  const doctor = doctors.find(d => d.id === doctorId);
  
  const formattedSlots = slots.map(s => ({
    id: s.id,
    time: format(s.datetime, 'EEEE, MMMM d \'at\' h:mm a')
  }));
  
  return NextResponse.json({
    success: true,
    doctor: doctor?.name,
    slots: formattedSlots,
    message: formattedSlots.length > 0 
      ? `I found ${formattedSlots.length} available times with ${doctor?.name}`
      : `I don't have any available times for that day. Let me check other options.`
  });
}

async function handleBookAppointment(params: any, metadata: any) {
  const { slotId, patientInfo, doctorId, reason } = params;
  
  const doctor = doctors.find(d => d.id === doctorId);

  // Get proper datetime from slot object instead of parsing the slot ID string
  const slot = doctor?.availability.find(s => s.id === slotId);
  
  const appointment = {
    id: crypto.randomUUID(),
    patient: patientInfo,
    doctorId,
    doctorName: doctor?.name || '',
    specialty: doctor?.specialty || '',
    slotId,
    datetime: slot ? slot.datetime.toISOString() : new Date().toISOString(),
    reason,
    createdAt: new Date().toISOString()
  };
  
  await saveAppointment(appointment);
  await sendAppointmentEmail(appointment);
  
  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    message: `Perfect! I've booked your appointment with ${doctor?.name}. You'll receive a confirmation email shortly.`
  });
}