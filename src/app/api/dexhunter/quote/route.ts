
import { NextResponse } from 'next/server';
import { getDexHunterApiKey, DEXHUNTER_API_URL } from '@/lib/dexhunter-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const buyToken = searchParams.get('buyToken');
  const sellToken = searchParams.get('sellToken');
  const sellAmount = searchParams.get('sellAmount');

  if (!buyToken || !sellToken || !sellAmount) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const apiKey = getDexHunterApiKey();
  
  try {
    const url = `${DEXHUNTER_API_URL}/quote?buyToken=${buyToken}&sellToken=${sellToken}&sellAmount=${sellAmount}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-Partner-Id'] = apiKey;
    }

    const res = await fetch(url, { headers });
    
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
