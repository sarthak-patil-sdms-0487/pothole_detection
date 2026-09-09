import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wrench,
  Search,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Camera,
  X,
  HardHat,
  Recycle,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config';
import { authFetch, useAuthStore } from '../store/authStore';

interface RepairJob {
  id: number;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  material_type: string | null;
  material_kg: number | null;
  cost_inr: number | null;
}

interface WorkOrder {
  defect_id: number;
  state: 'NOTICED' | 'CLOSED';
  severity: number | null;
  segment_id: number | null;
  segment_name: string | null;
  contractor_name: string | null;
  tender_ref: string | null;
  verdict: string | null;
  noticed_at: string | null;
  sla_due_at: string | null;
  sla_hours_remaining: number | null;
  breach_flag: boolean;
  closed_at: string | null;
  has_before_evidence: boolean;
  has_after_evidence: boolean;
  job: RepairJob | null;
}

type FilterKey = 'ALL' | 'BREACH' | 'UNASSIGNED' | 'CLOSED';

const MATERIAL_OPTIONS = [
  'ECOFIX Steel Slag Mix',
  'Cold Mix Bitumen',
  'Dense Bituminous Macadam',
  'Bought Aggregate',
];

/** Live countdown rendered from the SLA deadline, colour-coded by urgency. */
const SlaClock = ({ order }: { order: WorkOrder }) => {
  if (order.state === 'CLOSED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-bold text-xs ${
          order.breach_flag ? 'text-red-600' : 'text-emerald-600'
        }`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {order.breach_flag ? 'Closed late' : 'Closed in time'}
      </span>
    );
  }

  const hours = order.sla_hours_remaining;
  if (hours === null) {
    return <span className="text-xs text-gray-400 italic">No clock</span>;
  }

  if (hours <= 0) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-xs text-red-600">
        <AlertTriangle className="w-3.5 h-3.5" />
        Breached {Math.abs(hours).toFixed(1)}h ago
      </span>
    );
  }

  const tone = hours <= 12 ? 'text-red-600' : hours <= 24 ? 'text-amber-600' : 'text-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-xs font-mono ${tone}`}>
      <Clock className="w-3.5 h-3.5" />
      {hours.toFixed(1)}h left
    </span>
  );
};

const VerdictBadge = ({ verdict }: { verdict: string | null }) => {
  if (!verdict) return <span className="text-xs text-gray-400 italic">No verdict</span>;

  const inWarranty = verdict === 'IN_WARRANTY';
  const disputed = verdict === 'DISPUTED';
  const Icon = inWarranty ? ShieldCheck : ShieldAlert;
  const tone = inWarranty
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
    : disputed
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

  return (
    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1 ${tone}`}>
      <Icon className="w-3 h-3" />
      {verdict.replace(/_/g, ' ')}
    </span>
  );
};

const WorkOrders = () => {
  const { role } = useAuthStore();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const [assigning, setAssigning] = useState<WorkOrder | null>(null);
  const [assignForm, setAssignForm] = useState({
    assigned_to: '',
    material_type: MATERIAL_OPTIONS[0],
    material_kg: '',
    cost_inr: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/work-orders`);
      if (!res.ok) throw new Error('Failed to load the repair queue.');
      setOrders(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [role]);

  const openAssign = (order: WorkOrder) => {
    setAssigning(order);
    setAssignForm({
      assigned_to: order.job?.assigned_to || '',
      material_type: order.job?.material_type || MATERIAL_OPTIONS[0],
      material_kg: order.job?.material_kg != null ? String(order.job.material_kg) : '',
      cost_inr: order.job?.cost_inr != null ? String(order.job.cost_inr) : '',
    });
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigning) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/work-orders/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defect_id: assigning.defect_id,
          assigned_to: assignForm.assigned_to || null,
          material_type: assignForm.material_type || null,
          material_kg: assignForm.material_kg ? parseFloat(assignForm.material_kg) : null,
          cost_inr: assignForm.cost_inr ? parseFloat(assignForm.cost_inr) : null,
          start_now: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'Could not assign this repair job.');
      }
      setAssigning(null);
      fetchOrders();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const matchesSearch = (o: WorkOrder) => {
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return (
      `#${o.defect_id}`.includes(q) ||
      (o.segment_name || '').toLowerCase().includes(q) ||
      (o.contractor_name || '').toLowerCase().includes(q) ||
      (o.tender_ref || '').toLowerCase().includes(q) ||
      (o.job?.assigned_to || '').toLowerCase().includes(q)
    );
  };

  const visible = orders.filter((o) => {
    if (!matchesSearch(o)) return false;
    if (filter === 'BREACH') return o.breach_flag;
    if (filter === 'UNASSIGNED') return !o.job?.assigned_to && o.state === 'NOTICED';
    if (filter === 'CLOSED') return o.state === 'CLOSED';
    return true;
  });

  const openOrders = orders.filter((o) => o.state === 'NOTICED');
  const breaches = orders.filter((o) => o.breach_flag);
  const unassigned = openOrders.filter((o) => !o.job?.assigned_to);
  const recoverable = orders.filter((o) => o.verdict === 'IN_WARRANTY').length;

  const counts: Record<FilterKey, number> = {
    ALL: orders.length,
    BREACH: breaches.length,
    UNASSIGNED: unassigned.length,
    CLOSED: orders.filter((o) => o.state === 'CLOSED').length,
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="min-w-0">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1">
            <Wrench className="w-3 h-3" /> Repair Queue
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
            Work Orders
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Every defect brought to notice, with the contractor it was attributed to and the
            48-hour clock it is running against. Defects still in SIGHTING or CONFIRMED are not
            work orders — nothing is owed on them yet.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 self-start md:self-auto shrink-0 whitespace-nowrap"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-2xl px-5 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Open work orders', value: openOrders.length, tone: 'text-gray-900 dark:text-white' },
          { label: 'SLA breaches', value: breaches.length, tone: 'text-red-600' },
          { label: 'Awaiting crew', value: unassigned.length, tone: 'text-amber-600' },
          { label: 'Inside DLP', value: recoverable, tone: 'text-emerald-600' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm"
          >
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{kpi.label}</p>
            <p className={`text-2xl font-black mt-1 ${kpi.tone}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {(['ALL', 'BREACH', 'UNASSIGNED', 'CLOSED'] as FilterKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all ${
                filter === key
                  ? 'bg-govBlue text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {key === 'ALL' ? 'All' : key === 'BREACH' ? 'Breached' : key === 'UNASSIGNED' ? 'Awaiting crew' : 'Closed'}
              {' '}({counts[key]})
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search defect #, road, contractor, crew..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-xs focus:ring-2 focus:ring-govBlue"
          />
        </div>
      </div>

      {/* Queue */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading repair queue...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No work orders match this filter. Work orders appear once an engineer brings a defect
            to notice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700 text-xs whitespace-nowrap">
                <tr>
                  <th className="py-3 px-4">Defect / Road</th>
                  <th className="py-3 px-4">Liable Contractor</th>
                  <th className="py-3 px-4">48h Clock</th>
                  <th className="py-3 px-4">Crew &amp; Material</th>
                  <th className="py-3 px-4 text-center">Evidence</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {visible.map((o, idx) => (
                  <motion.tr
                    key={o.defect_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                    className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors ${
                      o.breach_flag && o.state === 'NOTICED' ? 'bg-red-50/40 dark:bg-red-950/10' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-bold text-govBlue dark:text-blue-400">#{o.defect_id}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {o.segment_name || (o.segment_id ? `Segment #${o.segment_id}` : 'Unmatched location')}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        {o.contractor_name || 'No matching contract'}
                      </p>
                      <p className="text-[11px] font-mono text-gray-400">{o.tender_ref || '--'}</p>
                      <div className="mt-1">
                        <VerdictBadge verdict={o.verdict} />
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <SlaClock order={o} />
                      {o.sla_due_at && o.state === 'NOTICED' && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          due {new Date(o.sla_due_at).toLocaleString()}
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {o.job?.assigned_to ? (
                        <>
                          <p className="text-xs font-semibold text-gray-900 dark:text-white inline-flex items-center gap-1">
                            <HardHat className="w-3 h-3 text-gray-400" /> {o.job.assigned_to}
                          </p>
                          {o.job.material_type && (
                            <p className="text-[11px] text-gray-500 inline-flex items-center gap-1 mt-0.5">
                              <Recycle className="w-3 h-3" /> {o.job.material_type}
                              {o.job.material_kg ? ` · ${o.job.material_kg} kg` : ''}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-amber-600 font-semibold">Awaiting crew</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          title="Before photo"
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            o.has_before_evidence
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-400 dark:bg-gray-700'
                          }`}
                        >
                          <Camera className="w-3 h-3" /> B
                        </span>
                        <span
                          title="After photo"
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            o.has_after_evidence
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-400 dark:bg-gray-700'
                          }`}
                        >
                          <Camera className="w-3 h-3" /> A
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {o.state === 'NOTICED' && role === 'ENGINEER' && (
                        <button
                          onClick={() => openAssign(o)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-govBlue text-white hover:bg-blue-700 active:scale-95 transition-all"
                        >
                          {o.job?.assigned_to ? 'Update' : 'Assign'}
                        </button>
                      )}
                      <Link
                        to="/review"
                        className="ml-2 text-xs text-gray-400 hover:text-govBlue inline-flex items-center"
                      >
                        Review <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
        Contractor attribution is a probable match derived from road-segment to tender mapping, to
        be verified against the tender documents before any recovery action. Repair close-out and
        after-photo verification happen on the Review Reports screen.
      </p>

      {/* Assign modal */}
      <AnimatePresence>
        {assigning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-5"
            >
              <div className="flex justify-between items-start pb-3 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Assign repair — Defect #{assigning.defect_id}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {assigning.segment_name || `Segment #${assigning.segment_id}`} ·{' '}
                    {assigning.contractor_name || 'No matching contract'}
                  </p>
                </div>
                <button
                  onClick={() => setAssigning(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={submitAssign} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Assigned crew *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ward 3 Cold-Mix Crew"
                    value={assignForm.assigned_to}
                    onChange={(e) => setAssignForm({ ...assignForm, assigned_to: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Material
                    </label>
                    <select
                      value={assignForm.material_type}
                      onChange={(e) => setAssignForm({ ...assignForm, material_type: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    >
                      {MATERIAL_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Quantity (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 85"
                      value={assignForm.material_kg}
                      onChange={(e) => setAssignForm({ ...assignForm, material_kg: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Repair cost (INR, optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Leave blank to value at the standard slag rate"
                    value={assignForm.cost_inr}
                    onChange={(e) => setAssignForm({ ...assignForm, cost_inr: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                  />
                  {assigning.verdict === 'IN_WARRANTY' && (
                    <p className="text-[11px] text-emerald-600 mt-1">
                      This defect sits inside an active DLP — the cost is recoverable from the
                      contractor rather than the estate maintenance budget.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssigning(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-govBlue text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isSaving ? 'Saving...' : 'Save work order'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkOrders;
