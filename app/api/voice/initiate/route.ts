import { NextRequest, NextResponse } from 'next/server';
import { getConversation } from '@/lib/db';
import { doctors } from '@/lib/doctors';
import { Conversation } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }
    
    // Get conversation state
    const conversation = await getConversation(sessionId);
    
    if (!conversation || !conversation.patient) {
      return NextResponse.json(
        { error: 'No patient information found. Please complete chat first.' },
        { status: 400 }
      );
    }
    
    const patient = conversation.patient;
    
    // Build context summary for voice agent
    const contextSummary = buildContextSummary(conversation);
    
    // Initiate call via Bland API
    const response = await fetch('https://api.bland.ai/v1/calls', {
        method: 'POST',
        headers: {
            'Authorization': process.env.BLAND_API_KEY!,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            phone_number: patient.phone,
            pathway_id: 'd86565f7-2fcc-48c3-9266-506595f44c4c', // ADD THIS LINE
            voice: 'maya',
            webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`,
            first_sentence: `Hi ${patient.firstName}, I'm continuing our conversation about your appointment. ${getContextualGreeting(conversation)}`,
            dynamic_data: [
                {
                    name: 'patient_context',
                    data: contextSummary
                },
                {
                    name: 'session_id',
                    data: sessionId
                }
            ],
            metadata: {
                sessionId,
                patientEmail: patient.email
            }
        })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      return NextResponse.json({
        success: true,
        callId: data.call_id,
        phoneNumber: patient.phone
      });
    } else {
      throw new Error(data.message || 'Failed to initiate call');
    }
    
  } catch (error) {
    console.error('Voice initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate call' },
      { status: 500 }
    );
  }
}

function buildContextSummary(conversation: Conversation): string {
  const patient = conversation.patient!;  // Add ! since we already checked it exists
  let context = `You are continuing a conversation with ${patient.firstName} ${patient.lastName} who started scheduling an appointment via web chat.\n\n`;
  
  context += `PATIENT INFORMATION:\n`;
  context += `- Name: ${patient.firstName} ${patient.lastName}\n`;
  context += `- DOB: ${patient.dob}\n`;
  context += `- Phone: ${patient.phone}\n`;
  context += `- Email: ${patient.email}\n\n`;
  
  if (conversation.pendingBooking) {
    const doctor = doctors.find(d => d.id === conversation.pendingBooking!.doctorId);
    context += `BOOKING IN PROGRESS:\n`;
    context += `- Reason for visit: ${conversation.pendingBooking.reason}\n`;
    context += `- Matched doctor: ${doctor?.name} (${doctor?.specialty})\n`;
    
    if (conversation.pendingBooking.suggestedSlots?.length > 0) {
      context += `- Available times were already shown in chat\n`;
    }
    context += `\nThe patient is ready to select an appointment time or may have questions.\n\n`;
  }
  
  context += `CONVERSATION HISTORY:\n`;
  const recentMessages = conversation.messages.slice(-6);
  recentMessages.forEach((msg) => {
    context += `${msg.role === 'user' ? 'Patient' : 'Assistant'}: ${msg.content}\n`;
  });
  
  context += `\nYour job: Help them complete the booking or answer questions. Use the webhook to check availability and book appointments. Be warm and professional.`;
  
  return context;
}

function getContextualGreeting(conversation: Conversation): string {
  if (conversation.pendingBooking) {
    const doctor = doctors.find(d => d.id === conversation.pendingBooking!.doctorId);
    return `Let's finish booking your appointment with ${doctor?.name}.`;
  }
  return "How can I help you today?";
}
