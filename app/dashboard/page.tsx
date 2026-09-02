'use client';

import { useState } from 'react';
import { Bot, Copy, Check, Calendar, Gift, LogOut, Edit, Save, X, Users, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Agent {
  id: string;
  agent_name: string;
  custom_agent_slug: string;
  payment_status: 'PENDING' | 'PAID' | 'TRIAL' | 'EXPIRED';
  period_end: string | null;
  trial_ends_at: string | null;
  knowledge_base: string;
  referral_code: string;
  referral_bonus_days: number;
  created_at: string;
  total_referred?: number;
}

interface Lead {
  id: string;
  agent_id: string;
  customer_name: string;
  customer_phone: string;
  message_summary: string;
  source: string;
  created_at: string;
}

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [contact, setContact] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    knowledge_base: '',
  });

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/dashboard/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Dashboard auth API error:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || 'Authentication failed');
        } catch {
          throw new Error('Authentication failed');
        }
      }

      const data = await res.json();
      setAgents(data.agents);
      setIsAuthenticated(true);
      await fetchLeads(data.agents);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async (agentList: Agent[]) => {
    setLoadingLeads(true);
    try {
      const res = await fetch('/api/dashboard/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });

      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoadingLeads(false);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent.id);
    setEditFormData({ knowledge_base: agent.knowledge_base });
  };

  const handleSave = async (agentId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/update-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          knowledgeBase: editFormData.knowledge_base,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Update agent API error:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || 'Update failed');
        } catch {
          throw new Error('Update failed');
        }
      }

      const data = await res.json();
      setAgents(agents.map(agent => 
        agent.id === agentId 
          ? { ...agent, knowledge_base: editFormData.knowledge_base }
          : agent
      ));
      setEditingAgent(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditingAgent(null);
    setEditFormData({ knowledge_base: '' });
  };

  const getDaysRemaining = (periodEnd: string | null) => {
    if (!periodEnd) return 0;
    const end = new Date(periodEnd);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const getHoursRemaining = (trialEndsAt: string | null) => {
    if (!trialEndsAt) return 0;
    const end = new Date(trialEndsAt);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60)));
  };

  const getTrialCountdown = (trialEndsAt: string | null) => {
    if (!trialEndsAt) return null;
    const end = new Date(trialEndsAt);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) return { expired: true, days: 0, hours: 0 };
    const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return { expired: false, days, hours, totalHours };
  };

  const getReferralStats = () => {
    // Calculate total referrals and bonus days from agent data
    const totalReferred = agents.reduce((sum, agent) => sum + (agent.total_referred || 0), 0);
    const totalBonusDays = agents.reduce((sum, agent) => sum + agent.referral_bonus_days, 0);
    return { totalReferred, totalBonusDays };
  };

  const { totalReferred, totalBonusDays } = getReferralStats();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Dashboard Agent Saya</CardTitle>
            <p className="text-sm text-muted-foreground">
              Masukkan email atau WhatsApp Anda untuk mengakses dashboard
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact">Email atau WhatsApp</Label>
                <Input
                  id="contact"
                  type="text"
                  placeholder="budi@email.com atau 08123456789"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Memuat...' : 'Masuk Dashboard'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const primaryAgent = agents[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5">
      <div className="container mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard Saya</h1>
            <p className="text-muted-foreground">Kelola AI Agent dan referral Anda</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setIsAuthenticated(false);
              setContact('');
              setAgents([]);
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Keluar
          </Button>
        </div>

        {/* Trial Countdown Banners */}
        {agents.filter((a) => a.payment_status === 'TRIAL' && a.trial_ends_at).length > 0 && (
          <div className="mb-6 space-y-3">
            {agents.filter((a) => a.payment_status === 'TRIAL' && a.trial_ends_at).map((agent) => {
              const countdown = getTrialCountdown(agent.period_end);
              if (!countdown) return null;

              if (countdown.expired) {
                return (
                  <Card key={`trial-expired-${agent.id}`} className="border-red-300 bg-red-50">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-red-100 p-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-red-900">Trial Berakhir</h3>
                          <p className="text-sm text-red-700">
                            Agent <strong>{agent.agent_name}</strong> sudah tidak aktif. Upgrade sekarang untuk mengaktifkan kembali.
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" className="bg-red-600 hover:bg-red-700">
                        <a href={`/checkout?slug=${agent.custom_agent_slug}&renewal=true`}>Upgrade Sekarang</a>
                      </Button>
                    </CardContent>
                  </Card>
                );
              }

              if (countdown.totalHours! <= 48) {
                return (
                  <Card key={`trial-warning-${agent.id}`} className="border-amber-300 bg-amber-50">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-amber-100 p-2">
                          <Clock className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-amber-900">⚠️ Trial Berakhir dalam {countdown.totalHours} jam</h3>
                          <p className="text-sm text-amber-700">
                            Agent <strong>{agent.agent_name}</strong> akan nonaktif. Upgrade sekarang dengan harga spesial.
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
                        <a href={`/checkout?slug=${agent.custom_agent_slug}&renewal=true`}>Upgrade Sekarang</a>
                      </Button>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={`trial-info-${agent.id}`} className="border-primary/30 bg-primary/5">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">🎁 Free Trial Aktif</h3>
                        <p className="text-sm text-muted-foreground">
                          Agent <strong>{agent.agent_name}</strong> tersisa <strong>{countdown.days} hari {countdown.hours} jam</strong>
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/checkout?slug=${agent.custom_agent_slug}&renewal=true`}>Lihat Paket</a>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* My AI Agents Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI Agent Saya
            </h2>
            {agents.map((agent) => {
              const daysRemaining = getDaysRemaining(agent.period_end);
              const chatUrl = `${origin}/chat/${agent.custom_agent_slug}`;
              const embedUrl = `${origin}/embed/${agent.custom_agent_slug}`;
              const referralUrl = `${origin}?ref=${agent.referral_code}`;
              const embedCode = `<iframe src="${embedUrl}" width="380" height="600" frameborder="0" style="border:none;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.1)"></iframe>`;

              return (
                <Card key={agent.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{agent.agent_name}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={agent.payment_status === 'PAID' ? 'default' : 'secondary'}>
                            {agent.payment_status}
                          </Badge>
                          {agent.payment_status === 'PAID' && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {daysRemaining} hari tersisa
                            </Badge>
                          )}
                        </div>
                      </div>
                      {editingAgent !== agent.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(agent)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {editingAgent === agent.id ? (
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="knowledge_base">Knowledge Base</Label>
                          <Textarea
                            id="knowledge_base"
                            value={editFormData.knowledge_base}
                            onChange={(e) => setEditFormData({ knowledge_base: e.target.value })}
                            rows={6}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSave(agent.id)}
                            disabled={loading}
                          >
                            <Save className="mr-2 h-4 w-4" />
                            Simpan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Batal
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Shareable Link */}
                        <div className="space-y-2">
                          <Label>Link Shareable</Label>
                          <div className="flex gap-2">
                            <Input
                              value={chatUrl}
                              readOnly
                              className="text-sm"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopy(chatUrl, 'chat')}
                            >
                              {copied === 'chat' ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Embed Code */}
                        <div className="space-y-2">
                          <Label>Embed Code</Label>
                          <div className="flex gap-2">
                            <Input
                              value={embedCode}
                              readOnly
                              className="text-sm font-mono"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopy(embedCode, 'embed')}
                            >
                              {copied === 'embed' ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Leads Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Daftar Lead / Calon Pembeli
            </h2>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lead dari Chat AI Agent</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Calon pembeli yang menunjukkan minat melalui chat
                </p>
              </CardHeader>
              <CardContent>
                {loadingLeads ? (
                  <p className="text-sm text-muted-foreground">Memuat leads...</p>
                ) : leads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada lead yang terdeteksi.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground">Tanggal</th>
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground">Nama</th>
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground">WA</th>
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground">Ringkasan Minat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead) => (
                          <tr key={lead.id} className="border-b last:border-0">
                            <td className="py-2 px-2">
                              {new Date(lead.created_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-2 px-2 font-medium">{lead.customer_name}</td>
                            <td className="py-2 px-2">
                              <a
                                href={`https://wa.me/${lead.customer_phone.replace(/^0/, '62')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {lead.customer_phone}
                              </a>
                            </td>
                            <td className="py-2 px-2 text-muted-foreground max-w-xs truncate">
                              {lead.message_summary}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Referral Program Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Program Referral
            </h2>

            {/* Referral Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistik Referral</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-3xl font-bold text-primary">{totalReferred}</div>
                    <div className="text-sm text-muted-foreground">Total Direferensikan</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-3xl font-bold text-primary">{totalBonusDays}</div>
                    <div className="text-sm text-muted-foreground">Hari Bonus Didapat</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Referral Link */}
            {primaryAgent && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Link Referral Anda</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Bagikan link ini dan dapat +7 hari untuk setiap referral yang berhasil
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={`${origin}?ref=${primaryAgent.referral_code}`}
                        readOnly
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(`${origin}?ref=${primaryAgent.referral_code}`, 'referral')}
                      >
                        {copied === 'referral' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Kode referral: <span className="font-mono font-semibold">{primaryAgent.referral_code}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* How it works */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cara Kerja</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">1.</span>
                    <span>Bagikan link referral Anda ke teman atau kenalan</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">2.</span>
                    <span>Mereka membuat AI Agent melalui link Anda</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">3.</span>
                    <span>Ketika mereka membayar, Anda dapat +7 hari gratis</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-primary">4.</span>
                    <span>Tanpa batas - semakin banyak referral, semakin banyak bonus</span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
