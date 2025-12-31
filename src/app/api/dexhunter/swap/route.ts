
import { NextResponse } from 'next/server';
import { getDexHunterApiKey, DEXHUNTER_API_URL } from '@/lib/dexhunter-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = getDexHunterApiKey();
    const partnerName = process.env.DEXHUNTER_PARTNER_NAME;

    // Only inject partner info if both are present and valid
    // Note: If partner credentials are invalid, DexHunter returns 400 "Invalid partner"
    // So we only add them if they look valid (not empty, not placeholder)
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
    
    const url = `${DEXHUNTER_API_URL}/swap/build`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Only add X-Partner-Id header if valid
    if (isValidPartnerKey) {
      headers['X-Partner-Id'] = apiKey;
    }

    console.log('[DexHunter /swap/build] Request:', JSON.stringify({
      ...body,
      partnerCode: body.partnerCode ? '***' : undefined // hide in logs
    }, null, 2));

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        console.error('[DexHunter /swap/build] Error:', res.status, errorText);
        
        // Parse and improve error message for user
        let userMessage = errorText || 'DexHunter API error';
        
        if (errorText.toLowerCase().includes('not enough funds')) {
          userMessage = 'Insufficient funds. DexHunter requires extra ADA for: (1) transaction fees (~0.2 ADA), (2) minimum UTxO deposit (~2 ADA for output with tokens), and (3) possible protocol deposits. Try swapping a smaller amount or ensure you have at least 5 ADA more than the swap amount.';
        }
        
        return NextResponse.json({ error: userMessage }, { status: res.status });
    }

    const data = await res.json();
    console.log('[DexHunter /swap/build] Response OK');
    return NextResponse.json(data);
  } catch (error) {
    console.error('[DexHunter /swap/build] Server error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
