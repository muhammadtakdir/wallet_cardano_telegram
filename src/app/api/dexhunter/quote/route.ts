import { NextResponse } from 'next/server';
import { getDexHunterApiKey, DEXHUNTER_API_URL } from '@/lib/dexhunter-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = getDexHunterApiKey();
    const partnerName = process.env.DEXHUNTER_PARTNER_NAME;

    // Only inject partner info if valid (avoid "Invalid partner" error)
    const isValidPartnerKey = apiKey && 
      apiKey.length > 10 && 
      !apiKey.includes('YOUR_') &&
      !apiKey.includes('PLACEHOLDER');
    
    if (isValidPartnerKey) {
      body.partnerCode = apiKey;
      if (partnerName) {
        body.partnerName = partnerName;
      }
    }
    
    const url = `${DEXHUNTER_API_URL}/swap/estimate`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (isValidPartnerKey) {
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