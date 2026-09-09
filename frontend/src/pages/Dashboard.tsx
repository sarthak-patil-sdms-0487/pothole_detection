import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  ShieldAlert, 
  Car, 
  Building2, 
  ArrowRight,
  Loader,
  MapPin,
  ChevronRight
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAuthStore, authFetch } from '../store/authStore';

interface Defect {
  id: number;
  segment_id?: number;
  segment_name?: string;
  state: string;
  first_seen_at?: string;
  noticed_at?: string;
  sla_due_at?: string;
  sla_hours_remaining?: number;
  severity?: number;
  breach_flag: boolean;
  repeat_sighting_count: number;
  latest_verdict?: {
    verdict: string;
    rationale?: string;
  };
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/defects`);
      if (res.ok) {
        const data = await res.json();
        setDefects(data);
      }
    } catch (e) {
      console.error('Failed to load dashboard defects:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [role]);

  const totalDefects = defects.length;
  const noticedDefects = defects.filter((d) => d.state === 'NOTICED');
  const breachedDefects = defects.filter((d) => d.breach_flag);
  const closedDefects = defects.filter((d) => d.state === 'CLOSED');

  const urgentNoticed = noticedDefects.sort((a, b) => (a.sla_hours_remaining || 0) - (b.sla_hours_remaining || 0)).slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* High Court Compliance Hero Banner */}
      <div className="bg-gradient-to-r from-govBlue to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold text-blue-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Bombay High Court Oct 2025 Compliance Infrastructure
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            SIDC / MIDC Statutory Road Mandate
          </h1>
          <p className="text-sm text-blue-100/90 leading-relaxed">
            Autonomous GIS road segment attribution, 48-hour contractor Defect Liability Period (DLP) enforcement, and certified YOLOv8 repair verification for Maharashtra industrial estates.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => navigate('/drive')}
              className="px-5 py-2.5 rounded-xl font-bold text-xs bg-white text-govBlue hover:bg-blue-50 transition-all flex items-center gap-2 shadow-md active:scale-95"
            >
              <Car className="w-4 h-4" /> Start Drive Mode (Opportunistic Capture)
            </button>
            <button
              onClick={() => navigate('/review')}
              className="px-5 py-2.5 rounded-xl font-bold text-xs bg-blue-700/60 hover:bg-blue-700 text-white border border-white/20 backdrop-blur-md transition-all flex items-center gap-2 active:scale-95"
            >
              <Activity className="w-4 h-4" /> Defect Review Pipeline
            </button>
          </div>
        </div>

        {/* Subtle Decorative Elements */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* KPI Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Active Defects</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{totalDefects}</p>
          <p className="text-xs text-gray-400 mt-1">Clustered within 15m radius</p>
        </div>

        <div className="bg-amber-50/60 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-sm">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> 48h SLA Clocks Active
          </p>
          <p className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{noticedDefects.length}</p>
          <p className="text-xs text-amber-600/80 mt-1">Under formal statutory notice</p>
        </div>

        <div className="bg-red-50/60 dark:bg-red-950/20 p-5 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-sm">
          <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> SLA Breaches
          </p>
          <p className="text-2xl font-black text-red-700 dark:text-red-300 mt-1">{breachedDefects.length}</p>
          <p className="text-xs text-red-600/80 mt-1">Actionable for liquidated damages</p>
        </div>

        <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Certified Closures
          </p>
          <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{closedDefects.length}</p>
          <p className="text-xs text-emerald-600/80 mt-1">Verified with 0 detections & ≤20m GPS</p>
        </div>
      </div>

      {/* Main Grid: Urgent 48h SLA Tickers & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Urgent 48-Hour Countdown Table */}
        <div className="lg:col-span-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> Active 48-Hour Statutory SLA Countdown Tickers
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Defects in NOTICED state requiring contractor restoration pursuant to High Court directives.
              </p>
            </div>
            <button
              onClick={() => navigate('/review')}
              className="text-xs font-bold text-govBlue hover:underline flex items-center gap-1"
            >
              View All ({noticedDefects.length}) <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-400"><Loader className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading active tickers...</div>
          ) : urgentNoticed.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-40 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No Active 48h SLA Notices</p>
              <p className="text-xs text-gray-400 mt-0.5">All road defects are either in triage or certified closed.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {urgentNoticed.map((d) => (
                <div
                  key={d.id}
                  onClick={() => navigate('/review')}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 px-3 rounded-xl cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-govBlue dark:text-blue-400">Defect #{d.id}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        {d.latest_verdict?.verdict || 'IN_WARRANTY'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                      {d.segment_name || `Segment #${d.segment_id}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className={`px-3 py-1 rounded-xl text-right font-mono text-xs font-black ${
                      d.breach_flag
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {d.breach_flag ? '⚠️ SLA BREACHED' : `⏱ ${d.sla_hours_remaining}h Left`}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions & Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-extrabold text-gray-900 dark:text-white">Quick Operations</h2>
            <div className="space-y-2.5">
              <button
                onClick={() => navigate('/drive')}
                className="w-full p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 hover:border-govBlue text-left flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-govBlue text-white rounded-lg"><Car className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Autonomous Drive Mode</p>
                    <p className="text-[10px] text-gray-500">Dash-mounted road video scanner</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-govBlue" />
              </button>

              <button
                onClick={() => navigate('/admin')}
                className="w-full p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 hover:border-purple-500 text-left flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-600 text-white rounded-lg"><Building2 className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Tender & DLP Admin</p>
                    <p className="text-[10px] text-gray-500">Manage contractors and warranties</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-600" />
              </button>

              <button
                onClick={() => navigate('/map')}
                className="w-full p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-500 text-left flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-600 text-white rounded-lg"><MapPin className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">GIS Spatial Map</p>
                    <p className="text-[10px] text-gray-500">Interactive corridor & defect pins</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;