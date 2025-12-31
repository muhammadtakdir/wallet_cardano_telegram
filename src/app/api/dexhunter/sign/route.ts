
import { NextResponse } from 'next/server';
import { getDexHunterApiKey, DEXHUNTER_API_URL } from '@/lib/dexhunter-server';

export async function POST(request: Request) {
  try {
    const body = await request.json(); // Should contain { txCbor, signatures }
    const apiKey = getDexHunterApiKey();

    console.log('[DexHunter Sign API] Request body keys:', Object.keys(body));
    console.log('[DexHunter Sign API] txCbor length:', body.txCbor?.length);
    console.log('[DexHunter Sign API] signatures length:', body.signatures?.length);

    const url = `${DEXHUNTER_API_URL}/swap/sign`;
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
        const errorText = await res.text();
        console.error('[DexHunter Sign API] Error status:', res.status);
        console.error('[DexHunter Sign API] Error response:', errorText);
        
        // Try to parse as JSON, otherwise return text
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `DexHunter API error: ${res.status}` };
        }
        return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[DexHunter Sign API] Exception:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}
