import fs from 'fs/promises';
import path from 'path';
import { Patient, Appointment, Conversation } from './types';  // Import from types

const DB_PATH = path.join(process.cwd(), 'data');

// Remove the Conversation interface definition from here - it's in types.ts

async function ensureDir() {
  try {
    await fs.mkdir(DB_PATH, { recursive: true });
  } catch (e) {}
}

export async function saveAppointment(appointment: Appointment) {
  await ensureDir();
  const filePath = path.join(DB_PATH, 'appointments.json');
  
  let appointments: Appointment[] = [];
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    appointments = JSON.parse(data);
  } catch (e) {}
  
  appointments.push(appointment);
  await fs.writeFile(filePath, JSON.stringify(appointments, null, 2));
}

export async function saveConversation(conversation: Conversation) {
  await ensureDir();
  const filePath = path.join(DB_PATH, `conversation-${conversation.sessionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
}

export async function getConversation(sessionId: string): Promise<Conversation | null> {
  try {
    const filePath = path.join(DB_PATH, `conversation-${sessionId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

export async function markSlotBooked(slotId: string) {
  // In a real app, update database. For MVP, we trust the booking array
  await saveAppointment({
    id: slotId,
    patient: {} as Patient,
    doctorId: 0,
    doctorName: '',
    slotId,
    datetime: '',
    reason: '',
    createdAt: new Date().toISOString()
  });
}