import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Filter, 
  Calendar, 
  FileCheck2, 
  ArrowLeft, 
  Loader,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Send,
  Camera,
  Layers,
  FileText,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/authStore';
import MapSnapshot from '../components/common/MapSnapshot';

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
  const [repairModalOpen, setRepairModalOpen] = useState<boolean>(false);
  const [comparisonModalOpen, setComparisonModalOpen] = useState<boolean>(false);

  // Repair Form
  const [repairFile, setRepairFile] = useState<File | null>(null);
  const [contractorNotes, setContractorNotes] = useState<string>('Slag-bound cold mix asphalt repair completed.');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);

  const fetchDefects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/defects`, {
        headers: { 'X-Role': role }
      });
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

  useEffect(() => {
    fetchDefects();
  }, [role]);

  // Handle manual notice promotion
  const handleManualNotice = async (defectId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/defects/${defectId}/notice`, {
        method: 'POST',
        headers: { 'X-Role': role }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Notice action failed');
      }
      const updated: Defect = await res.json();
      setSelectedDefect(updated);
      fetchDefects();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Open Notice Modal
  const openNoticeModal = async (defectId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/defects/${defectId}/notice`, {
        headers: { 'X-Role': role }
      });
      if (!res.ok) throw new Error('Failed to load notice details');
      const data = await res.json();
      setNoticePayload(data);
      setNoticeModalOpen(true);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Send Notice to Contractor
  const handleSendNotice = async (defectId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/defects/${defectId}/notice/send`, {
        method: 'POST',
        headers: { 'X-Role': role }
      });
      if (!res.ok) throw new Error('Failed to dispatch notice');
      const data = await res.json();
      alert(`Notice ${data.notice.notice_ref} dispatched successfully to ${data.recipient} (Status: ${data.status})`);
      setNoticeModalOpen(false);
      fetchDefects();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Submit Repair Evidence & Close
  const handleVerifyAndClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDefect || !repairFile) return;

    setIsVerifying(true);
    setVerificationResult(null);

    const formData = new FormData();
    formData.append('file', repairFile);
    formData.append('contractor_notes', contractorNotes);
    if (selectedDefect.sightings[0]?.lat) {
      formData.append('after_lat', selectedDefect.sightings[0].lat.toString());
      formData.append('after_lng', (selectedDefect.sightings[0].lng || 0).toString());
    }

    try {
      // 1. Submit repair evidence
      const evRes = await fetch(`${API_BASE_URL}/api/defects/${selectedDefect.id}/repair-evidence`, {
        method: 'POST',
        headers: { 'X-Role': role },
        body: formData
      });

      if (!evRes.ok) {
        const errJson = await evRes.json();
        throw new Error(errJson.detail?.message || 'Verification rejected by YOLO/GPS/Time checks');
      }

      // 2. Automatically close defect
      const closeRes = await fetch(`${API_BASE_URL}/api/defects/${selectedDefect.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Role': role },
        body: JSON.stringify({ reason: contractorNotes })
      });

      if (!closeRes.ok) throw new Error('Failed to close defect record');
      const closeData = await closeRes.json();

      setRepairModalOpen(false);
      setRepairFile(null);
      alert(`Repair Verified! Defect #${selectedDefect.id} closed. (SLA Breached: ${closeData.breach_flag ? 'YES' : 'NO'}, Latency: ${closeData.latency_hours}h)`);
      fetchDefects();
    } catch (err: any) {
      alert(`Verification Error: ${err.message}`);
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
    <div className="space-y-4 lg:space-y-6 flex flex-col h-full lg:h-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
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

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDefects}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100"
          >
            Refresh Feed
          </button>
        </div>
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
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 border border-gray-200 dark:border-gray-700 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Statutory Directive Notice</h3>
                </div>
                <button onClick={() => setNoticeModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                {noticePayload.notice_text}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setNoticeModalOpen(false)} className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Close</button>
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