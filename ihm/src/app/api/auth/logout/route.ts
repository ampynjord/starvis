import { NextResponse } from 'next/server';
import { clearSessionCookie } from '../../_utils/proxy';

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
