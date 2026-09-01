'use client';

import { useEffect, useState } from 'react';
import { Bot, Users, DollarSign, Activity, Trash2, RefreshCw, CheckCircle, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Agent {
  id: string;
  agent_name: string;
  custom_agent_slug: string;
  payment_status: string;
  plan_tier: string;
  period_end: string | null;
  trial_ends_at: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  amount: number;
  created_at: string;
}

interface Stats {
  totalAgents: number;
  totalPaidAgents: number;
  totalTrialAgents: number;
  totalExpiredAgents: number;
  totalLeads: number;
  totalRevenue: number;
}

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchData = async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${s}` },
      });
      if (!res.ok) {
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      setStats(data.stats);
      setAgents(data.agents);
      setAuthorized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (agentId: string, action: 'delete' | 'reset_trial' | 'activate_paid') => {
    if (action === 'delete' && !confirm('Hapus agent ini? Tidak bisa dibatalkan.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({ agentId, action }),
      });
      if (!res.ok) throw new Error('Failed');
      await fetchData(secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredAgents = filter === 'all' 
    ? agents 
    : agents.filter(a => a.payment_status === filter);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl">Admin Panel</CardTitle>
            <p className="text-sm text-muted-foreground">Masukkan ADMIN_SECRET</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); fetchData(secret); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="secret">Secret Key</Label>
                <Input
                  id="secret"
                  type="password"
                  placeholder="••••••••"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Loading...' : 'Masuk'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Set <code>ADMIN_SECRET</code> di Vercel env vars untuk mengaktifkan.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <Button variant="outline" onClick={() => setAuthorized(false)}>
            Logout
          </Button>
        </div>

        {stats && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Bot className="h-4 w-4" /> Total Agents
                </div>
                <p className="text-2xl font-bold mt-1">{stats.totalAgents}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.totalPaidAgents} paid · {stats.totalTrialAgents} trial · {stats.totalExpiredAgents} expired
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <DollarSign className="h-4 w-4" /> Revenue
                </div>
                <p className="text-2xl font-bold mt-1">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(stats.totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Users className="h-4 w-4" /> Leads
                </div>
                <p className="text-2xl font-bold mt-1">{stats.totalLeads}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Activity className="h-4 w-4" /> Conversion
                </div>
                <p className="text-2xl font-bold mt-1">
                  {stats.totalPaidAgents + stats.totalTrialAgents > 0
                    ? Math.round((stats.totalPaidAgents / (stats.totalPaidAgents + stats.totalTrialAgents)) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">paid / (paid+trial)</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Agents ({filteredAgents.length})</CardTitle>
              <div className="flex gap-2">
                {['all', 'PAID', 'TRIAL', 'EXPIRED', 'PENDING'].map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Agent</th>
                    <th className="text-left py-2 px-2">Owner</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Ends</th>
                    <th className="text-left py-2 px-2">Created</th>
                    <th className="text-left py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent) => (
                    <tr key={agent.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-2">
                        <div className="font-medium">{agent.agent_name}</div>
                        <div className="text-xs text-muted-foreground">/chat/{agent.custom_agent_slug}</div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="text-xs">{agent.owner_name}</div>
                        <div className="text-xs text-muted-foreground">{agent.owner_email}</div>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          agent.payment_status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                          agent.payment_status === 'TRIAL' ? 'bg-blue-100 text-blue-700' :
                          agent.payment_status === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {agent.payment_status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {agent.payment_status === 'TRIAL' && agent.trial_ends_at 
                          ? new Date(agent.trial_ends_at).toLocaleDateString('id-ID') 
                          : agent.period_end 
                          ? new Date(agent.period_end).toLocaleDateString('id-ID') 
                          : '-'}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {new Date(agent.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          {agent.payment_status !== 'PAID' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(agent.id, 'activate_paid')}
                              title="Activate as PAID"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          )}
                          {agent.payment_status === 'EXPIRED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(agent.id, 'reset_trial')}
                              title="Reset to TRIAL"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction(agent.id, 'delete')}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
