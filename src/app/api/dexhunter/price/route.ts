
import { NextResponse } from 'next/server';
import { getDexHunterApiKey, DEXHUNTER_API_URL, getTokenPrice } from '@/lib/dexhunter-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  // Specific token price
  if (token) {
     const price = await getTokenPrice(token);
     return NextResponse.json({ unit: token, price });
  }

  const apiKey = getDexHunterApiKey();
  
  try {
    // /price endpoint returns token prices (General list)
    const url = `${DEXHUNTER_API_URL}/price`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-Partner-Id'] = apiKey;
    }

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
        // Fallback or empty on error
        return NextResponse.json([], { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
