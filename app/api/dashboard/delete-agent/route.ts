import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/dashboard-session';

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { agentId } = body as { agentId?: string };

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId and contact are required' },
        { status: 400 }
      );
    }

    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('agents')
      .select('id, owner_email, owner_phone')
      .eq('id', agentId)
      .maybeSingle();

    if (fetchError) {
      console.error('Delete agent fetch error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const ownerEmail = String(agent.owner_email || '').trim().toLowerCase();
    const isOwner = ownerEmail === user.email;

    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('agents')
      .delete()
      .eq('id', agentId);

    if (deleteError) {
      console.error('Delete agent error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete agent server error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
