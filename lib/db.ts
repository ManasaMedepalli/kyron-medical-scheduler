// in-memory version for demo

// import { Patient, Appointment, Conversation } from './types';

// // In-memory storage (resets on each deployment, but fine for MVP demo)
// const conversations = new Map<string, Conversation>();
// const appointments: Appointment[] = [];

// export async function saveAppointment(appointment: Appointment) {
//   appointments.push(appointment);
//   console.log('Appointment saved:', appointment.id);
// }

// export async function saveConversation(conversation: Conversation) {
//   conversations.set(conversation.sessionId, conversation);
//   console.log('Conversation saved:', conversation.sessionId);
// }

// export async function getConversation(sessionId: string): Promise<Conversation | null> {
//   return conversations.get(sessionId) || null;
// }

// export async function markSlotBooked(slotId: string) {
//   // For MVP, we trust the booking array
//   console.log('Slot marked as booked:', slotId);
// }

import { createClient } from '@supabase/supabase-js';
import type { Conversation, Appointment } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function getConversation(sessionId: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[db] getConversation:', error);
    return null;
  }
  if (!data) return null;

  return {
    sessionId:      data.session_id,
    phone:          data.phone,
    messages:       data.messages || [],
    patient:        data.patient || undefined,
    pendingBooking: data.pending_booking || undefined,
    blandCallId:    data.bland_call_id || undefined,
    lastUpdated:    data.last_updated,
  };
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .upsert({
      session_id:      conv.sessionId,
      phone:           conv.patient?.phone || conv.phone || null,
      messages:        conv.messages,
      patient:         conv.patient || null,
      pending_booking: conv.pendingBooking || null,
      bland_call_id:   conv.blandCallId || null,
      last_updated:    new Date().toISOString(),
    }, { onConflict: 'session_id' });

  if (error) throw error;
}

export async function getConversationByPhone(phone: string): Promise<Conversation | null> {
  const normalized = phone.replace(/[\s\-\(\)]/g, '');

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('phone', normalized)
    .order('last_updated', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') return null;
  if (!data) return null;

  return {
    sessionId:      data.session_id,
    phone:          data.phone,
    messages:       data.messages || [],
    patient:        data.patient || undefined,
    pendingBooking: data.pending_booking || undefined,
    blandCallId:    data.bland_call_id || undefined,
    lastUpdated:    data.last_updated,
  };
}

export async function saveAppointment(appt: Appointment): Promise<void> {
  const { data: patientData, error: patientError } = await supabase
    .from('patients')
    .upsert({
      first_name: appt.patient.firstName,
      last_name:  appt.patient.lastName,
      dob:        appt.patient.dob,
      phone:      appt.patient.phone,
      email:      appt.patient.email,
      sms_opt_in: appt.patient.smsOptIn || false,
    }, { onConflict: 'email' })
    .select('id')
    .single();

  if (patientError) throw patientError;

  const { error: apptError } = await supabase
    .from('appointments')
    .upsert({
      id:          appt.id,
      patient_id:  patientData!.id,
      doctor_id:   appt.doctorId,
      doctor_name: appt.doctorName,
      specialty:   appt.specialty || '',
      slot_id:     appt.slotId,
      datetime:    appt.datetime,
      reason:      appt.reason,
      status:      'confirmed',
    }, { onConflict: 'slot_id' });

  if (apptError) throw apptError;
}

export async function isSlotBooked(slotId: string): Promise<boolean> {
  const { data } = await supabase
    .from('appointments')
    .select('id')
    .eq('slot_id', slotId)
    .eq('status', 'confirmed')
    .single();

  return data !== null;
}