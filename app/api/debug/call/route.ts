import { NextRequest, NextResponse } from 'next/server';

// GET /api/debug/call?callId=XXXX
// Returns full Bland.ai call details: transcript, tool calls, status
export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId');

  if (!callId) {
    return NextResponse.json({ error: 'callId query param required' }, { status: 400 });
  }

  const response = await fetch(`https://api.bland.ai/v1/calls/${callId}`, {
    headers: {
      'Authorization': process.env.BLAND_API_KEY!,
    }
  });

  const data = await response.json();
  return NextResponse.json(data);
}
