
import { NextResponse } from 'next/server';
import { getDexHunterApiKey, DEXHUNTER_API_URL } from '@/lib/dexhunter-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = getDexHunterApiKey();
    const partnerName = process.env.DEXHUNTER_PARTNER_NAME;

    // Inject partner info if not present
    if (apiKey && !body.partnerCode) {
      body.partnerCode = apiKey;
    }
    if (partnerName && !body.partnerName) {
      body.partnerName = partnerName;
    }
    
    const url = `${DEXHUNTER_API_URL}/swap`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-Partner-Id'] = apiKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
