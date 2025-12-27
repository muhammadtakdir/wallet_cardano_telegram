import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

// Verify Telegram WebApp data integrity
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

  const _hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataToCheck)
    .digest('hex');

  return _hash === hash;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { initData, walletAddress } = body;

    if (!initData) {
      return NextResponse.json(
        { error: 'Missing required fields: initData' },
        { status: 400 }
      );
    }

    // 1. Validate Telegram Data (Security Check)
    // Note: In development/local env without a real bot token, this might fail.
    // For now, we proceed if validation passes OR if we are in a dev environment simulating it.
    const isValid = verifyTelegramWebAppData(initData);
    
    // Parse user data from initData string
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    
    if (!userStr) {
       return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }

    const userData = JSON.parse(userStr);
    const telegramId = userData.id;
    const username = userData.username;

    if (!isValid && process.env.NODE_ENV === 'production') {
       return NextResponse.json({ error: 'Invalid Telegram data hash' }, { status: 403 });
    }

    // 2. Database Operation: UPSERT User
    // Check if user exists first to handle the "Welcome Bonus" logic correctly
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('tg_user_id', telegramId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error('Supabase fetch error:', fetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    let points = 0;
    
    if (!existingUser) {
      console.log(`[API] New user detected: ${telegramId}. Wallet provided: ${!!walletAddress}`);
      // New User: ONLY insert if we have a wallet address
      if (!walletAddress) {
        console.log(`[API] Skipping insert for ${telegramId} - Pre-check only`);
        return NextResponse.json({ success: true, registered: false, points: 0 });
      }

      console.log(`[API] Registering new user ${telegramId} with wallet ${walletAddress}`);
      points = 100;
      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          tg_user_id: telegramId,
          wallet_address: walletAddress,
          points: points,
          joined_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        return NextResponse.json({ error: 'Failed to register user' }, { status: 500 });
      }
    } else {
      // Existing User: Update wallet if provided and different, keep points
      points = existingUser.points;
      if (walletAddress && existingUser.wallet_address !== walletAddress) {
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ wallet_address: walletAddress }) 
          .eq('tg_user_id', telegramId);
          
        if (updateError) {
           console.error('Supabase update error:', updateError);
        }
      }
    }

    return NextResponse.json({ success: true, registered: true, points });

  } catch (error) {
    console.error('Registration API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
