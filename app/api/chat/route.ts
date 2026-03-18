import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/claude';
import { saveConversation, getConversation } from '@/lib/db';
import { Conversation } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId } = await req.json();
    
    if (!message || !sessionId) {
      return NextResponse.json(
        { error: 'Message and sessionId required' },
        { status: 400 }
      );
    }
    
    // Get or create conversation
    let conversation = await getConversation(sessionId);
    
    if (!conversation) {
      conversation = {
        sessionId,
        messages: [],
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Process message with Claude
    const { response, updatedConversation } = await processChatMessage(
      message,
      conversation
    );
    
    // Save conversation state
    await saveConversation(updatedConversation);
    
    return NextResponse.json({
      response,
      conversation: updatedConversation
    });
    
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}