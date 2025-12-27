import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

function verifyTelegramWebAppData(telegramInitData: string): boolean {
  if (!telegramInitData) return false;
  const urlParams = new URLSearchParams(telegramInitData);
  const hash = urlParams.get('hash');
  if (!hash) return false;
  urlParams.delete('hash');
  const dataToCheck = Array.from(urlParams.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN || '')
    .digest();
  const _hash = crypto.createHmac('sha256', secretKey).update(dataToCheck).digest('hex');
  return _hash === hash;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { initData, actionType } = body;

    if (!initData || !actionType) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const isValid = verifyTelegramWebAppData(initData);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Invalid auth' }, { status: 403 });
    }

    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (!userStr) return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
    const telegramId = JSON.parse(userStr).id;

    // Define points based on action
    let pointsToAdd = 0;
    switch (actionType) {
      case 'deposit': pointsToAdd = 500; break;
      case 'send': pointsToAdd = 500; break;
      case 'stake': pointsToAdd = 1000; break;
      case 'undelegate': pointsToAdd = 1000; break;
      default: return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Increment points in database
    // We use a raw increment to avoid race conditions
    const { data, error } = await supabaseAdmin.rpc('increment_points', {
      user_id: telegramId,
      amount: pointsToAdd
    });

    // Fallback if RPC is not setup yet: Use standard update (less safe for concurrency)
    if (error) {
      console.warn("RPC increment_points failed, falling back to fetch-update", error);
      const { data: user } = await supabaseAdmin.from('users').select('points').eq('tg_user_id', telegramId).single();
      if (user) {
        await supabaseAdmin.from('users').update({ points: (user.points || 0) + pointsToAdd }).eq('tg_user_id', telegramId);
      }
    }

    return NextResponse.json({ success: true, added: pointsToAdd });
  } catch (error) {
    console.error('Add points API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
