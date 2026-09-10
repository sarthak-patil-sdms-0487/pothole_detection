import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle,
  CheckCircle2, 
  Search, 
  FileCheck2, 
  ArrowLeft, 
  Loader,
  Clock,
  ShieldCheck,
  Send,
  Camera,
  FileText,
  ChevronRight,
  Sparkles,
  Lock,
  Download,
  Printer,
  MapPin,
  ImageIcon,
  Trash2
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAuthStore, authFetch } from '../store/authStore';
import { useNotification } from '../components/notifications';

interface Sighting {
  id: number;
  original_image_url: string;
  annotated_image_url: string;
  lat?: number;
  lng?: number;
  capture_source?: string;
  reportedDate?: string;
}

interface Evidence {
  id: number;
  kind: string;
  photo_uri: string;
  lat?: number;
  lng?: number;
  captured_at?: string;
}

interface Defect {
  id: number;
  segment_id?: number;
  segment_name?: string;
  state: 'SIGHTING' | 'CONFIRMED' | 'NOTICED' | 'CLOSED';
  first_seen_at?: string;
  confirmed_at?: string;
  noticed_at?: string;
  sla_due_at?: string;
  sla_hours_remaining?: number;
  severity?: number;
  promotion_reason?: string;
  closed_at?: string;
  breach_flag: boolean;
  repeat_sighting_count: number;
  policy_score?: number;
  latest_verdict?: {
    id: number;
    verdict: string;
    confidence?: number;
    rationale?: string;
    generated_at?: string;
  };
  sightings: Sighting[];
  evidence_list: Evidence[];
}

const getStatusBadge = (state: string, isBreached: boolean) => {
  if (isBreached && state === 'NOTICED') {
    return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 animate-pulse';
  }
  switch (state) {
    case 'SIGHTING':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case 'CONFIRMED':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
    case 'NOTICED':
      return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700';
    case 'CLOSED':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getVerdictBadge = (verdict?: string) => {
  switch (verdict) {
    case 'IN_WARRANTY':
      return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    case 'OUT_OF_WARRANTY':
      return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    case 'DISPUTED':
      return 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
};

interface AgeingSighting {
  defect_id: number;
  state: 'SIGHTING' | 'CONFIRMED';
  segment_id: number | null;
  segment_name: string | null;
  first_seen_at: string | null;
  age_hours: number;
  age_days: number;
  severity: number | null;
  repeat_sighting_count: number;
  policy_score: number;
  notice_threshold: number;
}

const EngineerReview: React.FC = () => {
  const { role } = useAuthStore();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [noticeModalOpen, setNoticeModalOpen] = useState<boolean>(false);
  const [noticePayload, setNoticePayload] = useState<any | null>(null);
  const { addNotification } = useNotification();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Discard a false positive. The detector occasionally boxes clean road, and
  // those must not linger in the queue or reach a contractor as a complaint.
  const handleDeleteDefect = async (defectId: number) => {
    setIsDeleting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/defects/${defectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Delete failed' }));
        throw new Error(err.detail || 'Delete failed');
      }
      const data = await res.json();
      setDeleteTarget(null);
      setSelectedDefect(null);
      await fetchDefects();
      addNotification(
        `Defect #${defectId} deleted as a false positive` +
        (data.detached_sightings ? ` — ${data.detached_sightings} sighting(s) kept` : ''),
        'success'
      );
    } catch (e) {
      setDeleteTarget(null);
      addNotification(`Could not delete defect: ${(e as Error).message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Download the complaint as a .txt file the engineer can attach or archive.
  const handleDownloadNotice = () => {
    if (!noticePayload) return;
    const blob = new Blob([noticePayload.notice_text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(noticePayload.notice_ref || 'complaint').replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Open the notice in a print window, which also gives "Save as PDF" for free.
  const handlePrintNotice = () => {
    if (!noticePayload) return;
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return;
    const esc = (t: string) =>
      String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    w.document.write(`<!doctype html><html><head><title>${esc(noticePayload.notice_ref)}</title>
      <style>
        @page { margin: 20mm; }
        body { font-family: Georgia, 'Times New Roman', serif; color:#111; line-height:1.55; }
        .head { border-bottom:3px double #111; padding-bottom:10px; margin-bottom:18px; }
        .org { font-size:17px; font-weight:700; letter-spacing:.3px; }
        .sub { font-size:11px; color:#555; margin-top:2px; }
        pre { font-family: Georgia, 'Times New Roman', serif; white-space:pre-wrap; font-size:12.5px; }
        img { max-width:70%; border:1px solid #999; margin-top:10px; }
        .cap { font-size:10.5px; color:#555; margin-top:4px; }
      </style></head><body>
      <div class="head">
        <div class="org">STATE INDUSTRIAL DEVELOPMENT CORPORATION (SIDC / MIDC)</div>
        <div class="sub">Pune Division &middot; Road Defect Monitoring Cell</div>
      </div>
      <pre>${esc(noticePayload.notice_text)}</pre>
      ${noticePayload.before_photo_url && noticePayload.before_photo_url !== 'N/A'
        ? `<div><img src="${esc(String(noticePayload.before_photo_url).startsWith('/') ? window.location.origin + noticePayload.before_photo_url : noticePayload.before_photo_url)}" /><div class="cap">Photographic evidence &mdash; ${esc(noticePayload.notice_ref)}</div></div>`
        : ''}
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };
  const [repairModalOpen, setRepairModalOpen] = useState<boolean>(false);
  const [comparisonModalOpen, setComparisonModalOpen] = useState<boolean>(false);

  // Repair Form
  const [repairFile, setRepairFile] = useState<File | null>(null);
  const [contractorNotes, setContractorNotes] = useState<string>('Slag-bound cold mix asphalt repair completed.');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [ageing, setAgeing] = useState<AgeingSighting[]>([]);
  const [ageingOpen, setAgeingOpen] = useState<boolean>(false);

  const fetchDefects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/defects`);
      if (!res.ok) throw new Error('Failed to fetch defect records');
      const data: Defect[] = await res.json();
      setDefects(data);

      if (selectedDefect) {
        const updated = data.find((d) => d.id === selectedDefect.id);
        if (updated) setSelectedDefect(updated);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgeing = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/stats/ageing-sightings`);
      if (res.ok) setAgeing(await res.json());
    } catch (e) {
      console.error('Failed to load ageing sightings:', e);
    }
  };

  useEffect(() => {
    fetchDefects();
    fetchAgeing();
  }, [role]);

  // Handle manual notice promotion
  const handleManualNotice = async (defectId: number) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/defects/${defectId}/notice`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Notice action failed');
      }
      const updated: Defect = await res.json();
      setSelectedDefect(updated);
      fetchDefects();
    } catch (e: any) {
      addNotification(e.message, 'error');
    }
  };

  // Open Notice Modal
  const openNoticeModal = async (defectId: number) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/defects/${defectId}/notice`);
      if (!res.ok) throw new Error('Failed to load notice details');
      const data = await res.json();
      setNoticePayload(data);
      setNoticeModalOpen(true);
    } catch (e: any) {
      addNotification(e.message, 'error');
    }
  };

  // Send Notice to Contractor
  const handleSendNotice = async (defectId: number) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/defects/${defectId}/notice/send`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to dispatch notice');
      const data = await res.json();
      addNotification(
        data.status === 'SENT'
          ? `Notice ${data.notice.notice_ref} emailed to ${data.recipient}`
          : `Notice ${data.notice.notice_ref} recorded for ${data.recipient} (${data.status})`,
        data.status === 'SENT' ? 'success' : 'info'
      );
      setNoticeModalOpen(false);
      fetchDefects();
    } catch (e: any) {
      addNotification(e.message, 'error');
    }
  };

  // Submit Repair Evidence & Close
  const handleVerifyAndClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDefect || !repairFile) return;

    setIsVerifying(true);

    const formData = new FormData();
    formData.append('file', repairFile);
    formData.append('contractor_notes', contractorNotes);
    if (selectedDefect.sightings[0]?.lat) {
      formData.append('after_lat', selectedDefect.sightings[0].lat.toString());
      formData.append('after_lng', (selectedDefect.sightings[0].lng || 0).toString());
    }

    try {
      // 1. Submit repair evidence
      const evRes = await authFetch(`${API_BASE_URL}/api/defects/${selectedDefect.id}/repair-evidence`, {
        method: 'POST',
        body: formData
      });

      if (!evRes.ok) {
        const errJson = await evRes.json();
        throw new Error(errJson.detail?.message || 'Verification rejected by YOLO/GPS/Time checks');
      }

      // 2. Automatically close defect
      const closeRes = await authFetch(`${API_BASE_URL}/api/defects/${selectedDefect.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: contractorNotes })
      });

      if (!closeRes.ok) throw new Error('Failed to close defect record');
      const closeData = await closeRes.json();

      setRepairModalOpen(false);
      setRepairFile(null);
      addNotification(
        `Defect #${selectedDefect.id} closed — repair verified. ` +
        `SLA ${closeData.breach_flag ? 'breached' : 'met'}, ${closeData.latency_hours}h.`,
        closeData.breach_flag ? 'info' : 'success'
      );
      fetchDefects();
    } catch (err: any) {
      addNotification(`Verification failed: ${err.message}`, 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const filteredDefects = defects.filter((d) => {
    const matchesStatus = statusFilter === 'ALL' || d.state === statusFilter;
    const matchesSearch = 
      `#${d.id}`.includes(searchTerm) ||
      (d.segment_name && d.segment_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.latest_verdict?.rationale && d.latest_verdict.rationale.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const latestSighting = selectedDefect?.sightings[0];

  return (
    <div className="w-full min-w-0 space-y-4 lg:space-y-6 flex flex-col h-full lg:h-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Bombay High Court Compliance Pipeline
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
            Defect Review & Compliance Operations
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Track road defects across 4-stage lifecycle: <span className="font-semibold text-blue-600">SIGHTING</span> (no clock) → <span className="font-semibold text-purple-600">CONFIRMED</span> (no clock) → <span className="font-semibold text-amber-600">NOTICED</span> (48h statutory clock) → <span className="font-semibold text-emerald-600">CLOSED</span> (certified).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { fetchDefects(); fetchAgeing(); }}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100"
          >
            Refresh Feed
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-2xl px-5 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Ageing unpromoted sightings.
          Sightings are never deleted, and the promotion policy is published config
          rather than a per-user choice. This panel is the control that makes those
          claims checkable: anything sitting unpromoted stays visible and gets older
          in public. */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <button
          onClick={() => setAgeingOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-bold text-sm text-gray-900 dark:text-white">
              Ageing unpromoted sightings
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
              {ageing.length}
            </span>
            <span className="hidden sm:inline text-xs text-gray-400 truncate">
              no statutory clock running — awaiting corroboration or engineer acceptance
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${ageingOpen ? 'rotate-90' : ''}`} />
        </button>

        {ageingOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {ageing.length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-gray-400">
                Nothing is sitting unpromoted. Every open defect has been brought to notice.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="py-2.5 px-4">Defect</th>
                      <th className="py-2.5 px-4">State</th>
                      <th className="py-2.5 px-4">Road Segment</th>
                      <th className="py-2.5 px-4 text-center">Sightings</th>
                      <th className="py-2.5 px-4 text-center">Policy Score</th>
                      <th className="py-2.5 px-4 text-right">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {ageing.map((a) => (
                      <tr
                        key={a.defect_id}
                        onClick={() => {
                          const match = defects.find((d) => d.id === a.defect_id);
                          if (match) setSelectedDefect(match);
                        }}
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono font-bold text-govBlue dark:text-blue-400">#{a.defect_id}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            a.state === 'CONFIRMED'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {a.state}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-700 dark:text-gray-300">
                          {a.segment_name || (a.segment_id ? `Segment #${a.segment_id}` : 'Unmatched location')}
                        </td>
                        <td className="py-2.5 px-4 text-center font-semibold text-gray-700 dark:text-gray-300">
                          {a.repeat_sighting_count}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-gray-600 dark:text-gray-400">
                          {a.policy_score} / {a.notice_threshold}
                        </td>
                        <td className={`py-2.5 px-4 text-right font-bold font-mono ${
                          a.age_days >= 7 ? 'text-red-600' : a.age_days >= 3 ? 'text-amber-600' : 'text-gray-500'
                        }`}>
                          {a.age_days >= 1 ? `${a.age_days}d` : `${a.age_hours}h`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main 2-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Column: Defects List */}
        <div className={`lg:col-span-5 bg-white dark:bg-gray-800 shadow-sm rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col h-[calc(100vh-14rem)] lg:h-[75vh] ${selectedDefect ? 'hidden lg:flex' : 'flex'}`}>
          
          {/* Filter Bar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search defect #, road name, contractor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-xs focus:ring-2 focus:ring-govBlue"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {['ALL', 'SIGHTING', 'CONFIRMED', 'NOTICED', 'CLOSED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all ${
                    statusFilter === st
                      ? 'bg-govBlue text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {st} ({st === 'ALL' ? defects.length : defects.filter(d => d.state === st).length})
                </button>
              ))}
            </div>
          </div>

          {/* List Items */}
          <div className="overflow-y-auto flex-1 p-3 space-y-2.5">
            {loading ? (
              <div className="p-8 text-center text-gray-400"><Loader className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading defect ledger...</div>
            ) : filteredDefects.length === 0 ? (
              <div className="text-center p-8 text-gray-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-40" />
                <p className="font-semibold text-sm">No defects found in this view.</p>
              </div>
            ) : (
              filteredDefects.map((d) => (
                <motion.div
                  key={d.id}
                  layout
                  onClick={() => setSelectedDefect(d)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedDefect?.id === d.id
                      ? 'border-govBlue bg-blue-50/60 dark:bg-blue-950/40 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-govBlue/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-sm text-gray-900 dark:text-white">Defect #{d.id}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {d.repeat_sighting_count} sighting{d.repeat_sighting_count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-full border ${getStatusBadge(d.state, d.breach_flag)}`}>
                      {d.breach_flag && d.state === 'NOTICED' ? 'SLA BREACHED' : d.state}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate mb-1">
                    {d.segment_name ? `Seg #${d.segment_id} - ${d.segment_name}` : 'Unassigned Segment'}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${getVerdictBadge(d.latest_verdict?.verdict)}`}>
                      {d.latest_verdict?.verdict || 'UNEVALUATED'}
                    </span>

                    {d.state === 'NOTICED' && (
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {d.sla_hours_remaining !== null ? `${d.sla_hours_remaining}h left` : '48h SLA'}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Detailed Inspector */}
        <div className={`lg:col-span-7 h-[calc(100vh-14rem)] lg:h-[75vh] ${!selectedDefect ? 'hidden lg:block' : 'block'}`}>
          {selectedDefect ? (
            <motion.div
              key={selectedDefect.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 shadow-sm rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full"
            >
              {/* Card Header */}
              <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/40">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedDefect(null)}
                    className="p-1.5 rounded-xl lg:hidden text-gray-500 hover:bg-gray-200"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-gray-900 dark:text-white">Defect #{selectedDefect.id}</h2>
                      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${getStatusBadge(selectedDefect.state, selectedDefect.breach_flag)}`}>
                        {selectedDefect.breach_flag && selectedDefect.state === 'NOTICED' ? 'SLA BREACHED' : selectedDefect.state}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      First seen: {selectedDefect.first_seen_at ? new Date(selectedDefect.first_seen_at).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Statutory SLA Status Box */}
                {selectedDefect.state === 'NOTICED' && (
                  <div className={`px-3 py-1.5 rounded-xl border text-right ${
                    selectedDefect.breach_flag 
                      ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300' 
                      : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider">Statutory SLA</p>
                    <p className="font-mono text-sm font-black flex items-center gap-1 justify-end">
                      <Clock className="w-3.5 h-3.5" />
                      {selectedDefect.breach_flag ? 'EXPIRED' : `${selectedDefect.sla_hours_remaining}h Remaining`}
                    </p>
                  </div>
                )}
              </div>

              {/* Scrollable Content */}
              <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-5 text-sm">
                
                {/* Photos Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Original Field Sighting</p>
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 aspect-video bg-gray-100 dark:bg-gray-900 relative">
                      {latestSighting?.original_image_url ? (
                        <img src={latestSighting.original_image_url} alt="Sighting" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-gray-400">No Image Available</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">AI Detector (best.pt)</p>
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 aspect-video bg-gray-100 dark:bg-gray-900 relative">
                      {latestSighting?.annotated_image_url ? (
                        <img src={latestSighting.annotated_image_url} alt="Annotated" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-gray-400">No Annotated Image</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Liability & Contract Summary */}
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-govBlue" /> Contractor Warranty & Liability
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getVerdictBadge(selectedDefect.latest_verdict?.verdict)}`}>
                      {selectedDefect.latest_verdict?.verdict || 'UNASSIGNED'}
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1 font-mono">
                    <p><span className="font-semibold text-gray-400">Road Corridor:</span> {selectedDefect.segment_name || 'Segment #' + selectedDefect.segment_id}</p>
                    <p><span className="font-semibold text-gray-400">Policy Score:</span> {selectedDefect.policy_score || 'N/A'} (Threshold: 2.50)</p>
                    <p><span className="font-semibold text-gray-400">Lifecycle Intake:</span> {selectedDefect.promotion_reason || 'Field Intake'}</p>
                  </div>

                  {selectedDefect.latest_verdict?.rationale && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 italic">
                      {selectedDefect.latest_verdict.rationale}
                    </div>
                  )}
                </div>

                {/* Action Controls */}
                <div className="pt-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Available Actions</p>
                  <div className="flex flex-wrap gap-2.5">
                    
                    {/* SIGHTING or CONFIRMED -> Accept to NOTICED */}
                    {(selectedDefect.state === 'SIGHTING' || selectedDefect.state === 'CONFIRMED') && (
                      <button
                        onClick={() => handleManualNotice(selectedDefect.id)}
                        disabled={role !== 'ENGINEER'}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition-all ${
                          role === 'ENGINEER'
                            ? 'bg-govBlue text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                        title={role !== 'ENGINEER' ? 'Only Engineers can issue statutory Notice' : 'Promote to NOTICED and start 48h clock'}
                      >
                        {role !== 'ENGINEER' ? <Lock className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Accept & Issue Notice (48h Clock)
                      </button>
                    )}

                    {/* NOTICED -> View Notice */}
                    {selectedDefect.state === 'NOTICED' && (
                      <>
                        <button
                          onClick={() => openNoticeModal(selectedDefect.id)}
                          className="px-4 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shadow"
                        >
                          <FileText className="w-3.5 h-3.5" /> View Statutory Notice
                        </button>

                        <button
                          onClick={() => setRepairModalOpen(true)}
                          className="px-4 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow"
                        >
                          <Camera className="w-3.5 h-3.5" /> Upload Repair Evidence & Close
                        </button>
                      </>
                    )}

                    {/* False positive escape hatch — engineers only, and never on a
                        CLOSED defect, which is part of the compliance record. */}
                    {selectedDefect.state !== 'CLOSED' && role === 'ENGINEER' && (
                      <button
                        onClick={() => setDeleteTarget(selectedDefect.id)}
                        title="Remove this defect if the detection was a false positive"
                        className="px-4 py-2.5 rounded-xl font-bold text-xs bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete (False Positive)
                      </button>
                    )}

                    {/* CLOSED -> View Comparison */}
                    {selectedDefect.state === 'CLOSED' && (
                      <button
                        onClick={() => setComparisonModalOpen(true)}
                        className="px-4 py-2.5 rounded-xl font-bold text-xs bg-emerald-700 text-white flex items-center gap-1.5 shadow"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> View Certified Before / After
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-2xl border border-gray-200 dark:border-gray-700 h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center hidden lg:flex">
              <FileCheck2 className="w-16 h-16 mb-3 opacity-20" />
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Select a Defect Record</h3>
              <p className="text-xs text-gray-500 max-w-sm mt-1">Select an item from the left ledger to inspect telemetry, notice documents, contractor warranty, and repair verification.</p>
            </div>
          )}
        </div>
      </div>

      {/* Notice Modal */}
      <AnimatePresence>
        {noticeModalOpen && noticePayload && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-gray-200 dark:border-gray-700 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Statutory Directive Notice</h3>
                </div>
                <button onClick={() => setNoticeModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              {/* Rendered as a letter on paper rather than a terminal dump: this is a
                  formal complaint an engineer may print, sign and file. */}
              <div className="bg-white text-gray-900 rounded-xl border border-gray-300 shadow-inner overflow-hidden">
                {/* Letterhead */}
                <div className="px-6 pt-6 pb-4 border-b-4 border-double border-gray-800">
                  <div className="text-[15px] font-bold tracking-wide leading-snug">
                    STATE INDUSTRIAL DEVELOPMENT CORPORATION (SIDC / MIDC)
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Pune Division &middot; Road Defect Monitoring Cell
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[11px]">
                    <span><span className="text-gray-500">Ref</span>{' '}
                      <span className="font-semibold">{noticePayload.notice_ref}</span></span>
                    <span><span className="text-gray-500">Severity</span>{' '}
                      <span className={`font-semibold ${
                        noticePayload.severity_label === 'CRITICAL' ? 'text-red-600'
                        : noticePayload.severity_label === 'MAJOR' ? 'text-orange-600'
                        : 'text-amber-600'}`}>
                        {noticePayload.severity_label || '—'}
                      </span></span>
                    <span><span className="text-gray-500">Deadline</span>{' '}
                      <span className="font-semibold">
                        {noticePayload.sla_due_at
                          ? new Date(noticePayload.sla_due_at).toLocaleString()
                          : '—'}
                      </span></span>
                  </div>
                </div>

                {/* Body of the complaint, in a serif face so it reads as a document */}
                <div className="px-6 py-5 max-h-[45vh] overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words font-serif text-[12.5px] leading-relaxed text-gray-800">
{noticePayload.notice_text}
                  </pre>

                  {/* Photographic evidence + location. The image path may be an
                      absolute URL or a same-origin path (/pothole-images/...), so
                      accept any real value; the map link renders independently so
                      location shows even if the photo is missing. */}
                  {(() => {
                    const img = noticePayload.before_photo_url;
                    const hasImg = img && img !== 'N/A';
                    const hasMap = !!noticePayload.map_pin_url;
                    if (!hasImg && !hasMap) return null;
                    return (
                      <div className="mt-5 pt-4 border-t border-gray-200">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                          <ImageIcon className="w-3.5 h-3.5" /> Photographic Evidence & Location
                        </div>
                        {hasImg && (
                          <img
                            src={img}
                            alt={`Annotated defect for ${noticePayload.notice_ref}`}
                            className="mt-2 rounded-lg border border-gray-300 max-h-72 w-auto"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {(noticePayload.coordinates?.lat != null) && (
                          <div className="mt-2 text-[11px] text-gray-600 font-mono">
                            GPS {noticePayload.coordinates.lat}, {noticePayload.coordinates.lng}
                          </div>
                        )}
                        {hasMap && (
                          <a href={noticePayload.map_pin_url} target="_blank" rel="noreferrer"
                             className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline">
                            <MapPin className="w-3.5 h-3.5" /> Open location in Maps
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setNoticeModalOpen(false)} className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Close</button>
                <button
                  onClick={handleDownloadNotice}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  onClick={handlePrintNotice}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
                <button
                  onClick={() => handleSendNotice(noticePayload.defect_id)}
                  disabled={role !== 'ENGINEER'}
                  className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow ${
                    role === 'ENGINEER' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" /> Dispatch Notice to Contractor
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation — in-app rather than window.confirm, which renders as
          a browser dialog captioned with the ngrok hostname. */}
      <AnimatePresence>
        {deleteTarget !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isDeleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 border border-gray-200 dark:border-gray-700 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    Delete Defect #{deleteTarget}?
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                    Use this for a false positive — a clean stretch of road wrongly flagged
                    as a pothole. The defect, its liability verdict and any repair records
                    are removed. The raw camera sightings are kept but detached.
                  </p>
                  <p className="text-xs font-bold text-red-600 mt-2">This cannot be undone.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteDefect(deleteTarget)}
                  disabled={isDeleting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 shadow disabled:opacity-60"
                >
                  {isDeleting
                    ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Deleting…</>
                    : <><Trash2 className="w-3.5 h-3.5" /> Delete Defect</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Repair Evidence Upload Modal */}
      <AnimatePresence>
        {repairModalOpen && selectedDefect && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 space-y-4 border border-gray-200 dark:border-gray-700 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Submit After-Repair Evidence</h3>
                <button onClick={() => setRepairModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <form onSubmit={handleVerifyAndClose} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Select After-Repair Photo *</label>
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={(e) => setRepairFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">YOLOv8 will run over this image to verify 0 remaining potholes.</p>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Restoration Notes</label>
                  <textarea
                    rows={2}
                    value={contractorNotes}
                    onChange={(e) => setContractorNotes(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setRepairModalOpen(false)} className="px-4 py-2 font-bold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
                  <button
                    type="submit"
                    disabled={isVerifying || !repairFile}
                    className="px-5 py-2 font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow flex items-center gap-1.5"
                  >
                    {isVerifying ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {isVerifying ? 'Running YOLO Checks...' : 'Verify & Close Defect'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Before / After Comparison Modal */}
      <AnimatePresence>
        {comparisonModalOpen && selectedDefect && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 border border-gray-200 dark:border-gray-700 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Certified Before / After Comparison</h3>
                </div>
                <button onClick={() => setComparisonModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Before (Noticed Defect)</p>
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 aspect-video bg-gray-100 dark:bg-gray-900">
                    <img src={selectedDefect.sightings[0]?.original_image_url || ''} alt="Before" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">After (Verified Restoration)</p>
                  <div className="rounded-xl overflow-hidden border border-emerald-300 dark:border-emerald-700 aspect-video bg-gray-100 dark:bg-gray-900">
                    <img src={selectedDefect.evidence_list.find(e => e.kind === 'AFTER')?.photo_uri || selectedDefect.sightings[0]?.original_image_url || ''} alt="After" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex justify-between items-center">
                <span>Closed at: {selectedDefect.closed_at ? new Date(selectedDefect.closed_at).toLocaleString() : 'Certified Closed'}</span>
                <span className="font-bold">{selectedDefect.breach_flag ? '⚠️ SLA Breached' : '✅ Met 48h High Court Mandate'}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EngineerReview;