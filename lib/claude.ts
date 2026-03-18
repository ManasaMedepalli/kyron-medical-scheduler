import Anthropic from '@anthropic-ai/sdk';
import { doctors, findDoctorByBodyPart, getAvailableSlots } from './doctors';
import { saveAppointment } from './db';
import { sendAppointmentEmail } from './email';
import { Appointment, Conversation, Patient } from './types'; 
import { format } from 'date-fns';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const tools = [
  {
    name: "collect_patient_info",
    description: "Collect patient's personal information for appointment booking",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Patient's first name" },
        lastName: { type: "string", description: "Patient's last name" },
        dob: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
        phone: { type: "string", description: "Phone number" },
        email: { type: "string", description: "Email address" }
      },
      required: ["firstName", "lastName", "dob", "phone", "email"]
    }
  },
  {
    name: "match_doctor_by_reason",
    description: "Find appropriate doctor based on patient's reason for visit",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Patient's reason for appointment" }
      },
      required: ["reason"]
    }
  },
  {
    name: "check_availability",
    description: "Check available appointment slots for a doctor",
    input_schema: {
      type: "object",
      properties: {
        doctorId: { type: "number", description: "Doctor's ID" },
        preferredDay: { type: "string", description: "Optional preferred day of week" }
      },
      required: ["doctorId"]
    }
  },
  {
    name: "book_appointment",
    description: "Confirm and book an appointment slot",
    input_schema: {
      type: "object",
      properties: {
        slotId: { type: "string", description: "Slot ID to book" },
        patientInfo: { type: "object", description: "Patient information" },
        doctorId: { type: "number", description: "Doctor ID" },
        reason: { type: "string", description: "Reason for visit" }
      },
      required: ["slotId", "patientInfo", "doctorId", "reason"]
    }
  }
];

const systemPrompt = `You are a friendly medical appointment scheduling assistant for Kyron Medical practice.

Your role:
1. Greet patients warmly
2. Collect their information: first name, last name, DOB, phone, email
3. Ask about their reason for visit
4. Match them to the right specialist
5. Offer available appointment times
6. Confirm their booking
7. Let them know they'll receive email confirmation

CRITICAL SAFETY RULES:
- NEVER provide medical advice
- NEVER diagnose conditions
- NEVER recommend treatments
- If asked for medical advice, say: "I can only help with scheduling. Please discuss medical questions with your doctor during your appointment."

Available specialties:
- Orthopedics (Dr. Sarah Chen) - joints, bones, sports injuries
- Cardiology (Dr. Michael Rodriguez) - heart, chest pain
- Dermatology (Dr. Emily Watson) - skin conditions
- Gastroenterology (Dr. James Park) - digestive issues

If the patient needs a specialty we don't have, politely say: "I'm sorry, our practice doesn't currently treat that condition. I can provide our main number if you'd like to inquire about referrals."

Be conversational and natural. If patient says "Tuesday works better", check availability for Tuesdays.`;

export async function processChatMessage(
  message: string,
  conversation: Conversation
): Promise<{ response: string; updatedConversation: Conversation }> {
  
  conversation.messages.push({ role: 'user', content: message });
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversation.messages as any,
    tools: tools as any,
  });

  let assistantMessage = '';
  let continueProcessing = true;
  let currentResponse = response;
  
  while (continueProcessing) {
    continueProcessing = false;
    
    for (const block of currentResponse.content) {
      if (block.type === 'text') {
        assistantMessage += block.text;
      } else if (block.type === 'tool_use') {
        const toolResult = await handleToolUse(block.name, block.input, conversation);
        
        conversation.messages.push({
          role: 'assistant',
          content: currentResponse.content as any
        });
        
        conversation.messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) }] as any
        });
        
        currentResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: conversation.messages as any,
          tools: tools as any,
        });
        
        continueProcessing = true;
        break;
      }
    }
  }
  
  if (assistantMessage) {
    conversation.messages.push({ role: 'assistant', content: assistantMessage });
  }
  
  conversation.lastUpdated = new Date().toISOString();
  
  return { response: assistantMessage, updatedConversation: conversation };
}

async function handleToolUse(toolName: string, input: any, conversation: Conversation) {
  switch (toolName) {
    case 'collect_patient_info': {
      conversation.patient = input as Patient;
      return { success: true, message: 'Patient information collected' };
    }
      
    case 'match_doctor_by_reason': {
      const doctor = findDoctorByBodyPart(input.reason);
      if (!doctor) {
        return { success: false, message: 'No matching specialty found' };
      }
      conversation.pendingBooking = {
        doctorId: doctor.id,
        doctorName: doctor.name,
        reason: input.reason,
        suggestedSlots: []
      };
      return { 
        success: true, 
        doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty }
      };
    }
      
    case 'check_availability': {
      const slots = getAvailableSlots(input.doctorId, input.preferredDay);
      const formattedSlots = slots.map(s => ({
        id: s.id,
        datetime: format(s.datetime, 'EEEE, MMMM d, yyyy \'at\' h:mm a')
      }));
      
      if (conversation.pendingBooking) {
        conversation.pendingBooking.suggestedSlots = slots.map(s => s.id);
      }
      
      return { success: true, slots: formattedSlots };
    }
      
    case 'book_appointment': {
      const doctor = doctors.find(d => d.id === input.doctorId);
      
      const appointment: Appointment = {
        id: input.slotId,
        patient: input.patientInfo,
        doctorId: input.doctorId,
        doctorName: doctor?.name || 'Unknown Doctor',
        slotId: input.slotId,
        datetime: input.slotId.split('-').slice(1).join('-'),
        reason: input.reason,
        createdAt: new Date().toISOString()
      };
      
      await saveAppointment(appointment);
      await sendAppointmentEmail(appointment);
      
      return { success: true, appointmentId: appointment.id };
    }
      
    default:
      return { success: false, message: 'Unknown tool' };
  }
}