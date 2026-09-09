import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  IndianRupee, 
  Download,
  AlertOctagon,
  Percent,
  Recycle,
  Factory,
  Sparkles,
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { authFetch } from '../store/authStore';

interface ContractorScorecard {
  tender_id: number;
  name: string;
  tender_ref: string;
  contractor_email: string | null;
  dlp_expiry_date: string | null;
  dlp_status: 'IN_WARRANTY' | 'EXPIRED';
  defects_raised: number;
  in_dlp_count: number;
  notices_issued: number;
  fixed_within_sla: number;
  sla_breaches: number;
  open_count: number;
  compliance_rate: number;
  recoverable_cost_inr: number;
}

interface SlagSummary {
  total_lots: number;
  total_tonnes_allocated: number;
  total_kg_allocated: number;
  total_kg_drawn: number;
  total_kg_remaining: number;
  total_reclaimed_value_inr: number;
  co2_avoided_tonnes: number;
  rate_per_kg_inr: number;
}

interface SlagLot {
  id: number;
  tenant_unit_name: string;
  tonnes: number;
  kg_total: number;
  kg_drawn: number;
  kg_remaining: number;
  stockpile_location?: string;
  notional_value_inr: number;
}

interface SlagDraw {
  id: number;
  slag_lot_id: number;
  tenant_unit_name: string;
  repair_job_id: number;
  kg_drawn: number;
  notional_value_inr: number;
}

const AnalyticsPage: React.FC = () => {
  const [slagSummary, setSlagSummary] = useState<SlagSummary | null>(null);
  const [slagLots, setSlagLots] = useState<SlagLot[]>([]);
  const [slagDraws, setSlagDraws] = useState<SlagDraw[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [scorecards, setScorecards] = useState<ContractorScorecard[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const [sumRes, lotsRes, drawsRes, scoreRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/api/slag/summary`),
          authFetch(`${API_BASE_URL}/api/slag/lots`),
          authFetch(`${API_BASE_URL}/api/slag/draws`),
          authFetch(`${API_BASE_URL}/api/stats/contractors`)
        ]);

        if (sumRes.ok) setSlagSummary(await sumRes.json());
        if (lotsRes.ok) setSlagLots(await lotsRes.json());
        if (drawsRes.ok) setSlagDraws(await drawsRes.json());
        if (scoreRes.ok) setScorecards(await scoreRes.json());
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const totalNotices = scorecards.reduce((a, b) => a + b.notices_issued, 0);
  const totalBreaches = scorecards.reduce((a, b) => a + b.sla_breaches, 0);
  const totalRecoverable = scorecards.reduce((a, b) => a + b.recoverable_cost_inr, 0);
  const avgCompliance = scorecards.length
    ? (scorecards.reduce((a, b) => a + b.compliance_rate, 0) / scorecards.length).toFixed(1)
    : '0.0';

  return (
    <div className="w-full min-w-0 space-y-8 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Contractor Scorecard & Circular Economy
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
            DLP Compliance & Slag Allocation Ledger
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Contractor Defect Liability compliance ratings, 48-hour High Court SLA adherence, and M6 Industrial Steel Slag circular aggregate allocation tracking.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 flex items-center gap-2 shrink-0 whitespace-nowrap self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> Export Ledger (PDF)
        </button>
      </div>

      {/* SECTION 1: CONTRACTOR COMPLIANCE SCORECARD */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-govBlue" /> Contractor Defect Liability Scorecard
        </h2>

        {/* Scorecard KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Notices</p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{totalNotices}</p>
            <p className="text-xs text-gray-400 mt-1">Issued under High Court mandate</p>
          </div>

          <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <Percent className="w-3.5 h-3.5" /> 48h SLA Compliance
            </p>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{avgCompliance}%</p>
            <p className="text-xs text-emerald-600/80 mt-1">Repairs completed within 48h</p>
          </div>

          <div className="bg-red-50/60 dark:bg-red-950/20 p-5 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-sm">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider flex items-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5" /> Total SLA Breaches
            </p>
            <p className="text-2xl font-black text-red-700 dark:text-red-300 mt-1">{totalBreaches}</p>
            <p className="text-xs text-red-600/80 mt-1">Exceeded 48h deadline</p>
          </div>

          <div className="bg-purple-50/60 dark:bg-purple-950/20 p-5 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-sm">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
              <IndianRupee className="w-3.5 h-3.5" /> Recoverable Cost
            </p>
            <p className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1">₹{(totalRecoverable / 1000).toFixed(0)}k</p>
            <p className="text-xs text-purple-600/80 mt-1">Risk-and-cost recovery</p>
          </div>
        </div>

        {/* Scorecard Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-6 space-y-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading contractor scorecards...</div>
          ) : scorecards.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No defects have been attributed to a contract yet. Scorecards appear once defects on
              tender-mapped segments receive a liability verdict.
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700 text-xs whitespace-nowrap">
                <tr>
                  <th className="py-3 px-4">Contractor</th>
                  <th className="py-3 px-4">Contract Ref</th>
                  <th className="py-3 px-4">DLP Status</th>
                  <th className="py-3 px-4 text-center">Defects</th>
                  <th className="py-3 px-4 text-center">Inside DLP</th>
                  <th className="py-3 px-4 text-center">Notices</th>
                  <th className="py-3 px-4 text-center">48h SLA Met</th>
                  <th className="py-3 px-4 text-center">Breaches</th>
                  <th className="py-3 px-4 text-center">Compliance Rate</th>
                  <th className="py-3 px-4 text-right">Risk & Cost (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {scorecards.map((c) => (
                  <tr key={c.tender_id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors text-xs">
                    <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white whitespace-nowrap">{c.name}</td>
                    <td className="py-3.5 px-4 font-mono text-govBlue dark:text-blue-400 whitespace-nowrap">{c.tender_ref}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] whitespace-nowrap ${
                        c.dlp_status === 'IN_WARRANTY'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {c.dlp_status === 'IN_WARRANTY' ? 'In Warranty' : 'Expired'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700 dark:text-gray-300">{c.defects_raised}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-govBlue dark:text-blue-400">{c.in_dlp_count}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700 dark:text-gray-300">{c.notices_issued}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-emerald-600">{c.fixed_within_sla}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-red-600">{c.sla_breaches}</td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${c.compliance_rate >= 85 ? 'bg-emerald-500' : c.compliance_rate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${c.compliance_rate}%` }}
                          />
                        </div>
                        <span className="font-bold">{c.compliance_rate}%</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900 dark:text-gray-100">
                      {c.recoverable_cost_inr > 0 ? `₹${c.recoverable_cost_inr.toLocaleString()}` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 italic border-t border-gray-100 dark:border-gray-700 pt-3">
            Attribution is a probable match derived from road-segment to tender mapping. Figures are
            to be verified against the tender and contract documents before any recovery action.
          </p>
        </div>
      </div>

      {/* SECTION 2: M6 STEEL SLAG ALLOCATION LEDGER */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <Recycle className="w-5 h-5 text-emerald-600" /> M6 Industrial Steel Slag Circular Economy Ledger
          </h2>
          <span className="text-xs font-bold text-gray-500 font-mono">Rate: ₹15.70 / kg standard value</span>
        </div>

        {/* Slag KPI Cards */}
        {slagSummary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                <Factory className="w-3.5 h-3.5" /> Total Slag Allocated
              </p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{slagSummary.total_tonnes_allocated} T</p>
              <p className="text-xs text-emerald-600/80 mt-1">From Maharashtra steel mills</p>
            </div>

            <div className="bg-blue-50/60 dark:bg-blue-950/20 p-5 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
                <Recycle className="w-3.5 h-3.5" /> Diverted to Road Repair
              </p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">{slagSummary.total_kg_drawn.toLocaleString()} kg</p>
              <p className="text-xs text-blue-600/80 mt-1">Drawn by maintenance crews</p>
            </div>

            <div className="bg-purple-50/60 dark:bg-purple-950/20 p-5 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-sm">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5" /> Reclaimed Material Value
              </p>
              <p className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1">₹{slagSummary.total_reclaimed_value_inr.toLocaleString()}</p>
              <p className="text-xs text-purple-600/80 mt-1">Diverted from industrial landfills</p>
            </div>

            <div className="bg-teal-50/60 dark:bg-teal-950/20 p-5 rounded-2xl border border-teal-200 dark:border-teal-900/50 shadow-sm">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> CO2 Emissions Avoided
              </p>
              <p className="text-2xl font-black text-teal-700 dark:text-teal-300 mt-1">{slagSummary.co2_avoided_tonnes} T</p>
              <p className="text-xs text-teal-600/80 mt-1">0.28t CO2 avoided / t slag</p>
            </div>
          </div>
        )}

        {/* Slag Lots Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Active Steel Slag Stockpile Lots</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="py-2.5 px-3">Stockpile Lot</th>
                  <th className="py-2.5 px-3">Tenant Steel Unit</th>
                  <th className="py-2.5 px-3">Location Depot</th>
                  <th className="py-2.5 px-3 text-right">Total Allocated</th>
                  <th className="py-2.5 px-3 text-right">Drawn</th>
                  <th className="py-2.5 px-3 text-right">Remaining Reserve</th>
                  <th className="py-2.5 px-3 text-right">Notional Value (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {slagLots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-3 font-mono font-bold text-govBlue">LOT #{lot.id}</td>
                    <td className="py-3 px-3 font-semibold text-gray-900 dark:text-white">{lot.tenant_unit_name}</td>
                    <td className="py-3 px-3 text-gray-500">{lot.stockpile_location || 'Central Stockpile'}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">{lot.tonnes} T ({lot.kg_total.toLocaleString()} kg)</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-bold">{lot.kg_drawn.toLocaleString()} kg</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-gray-700 dark:text-gray-200">{lot.kg_remaining.toLocaleString()} kg</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-purple-600">₹{lot.notional_value_inr.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drawdown Transaction Log */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Recent Repair Material Drawdown Transactions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="py-2.5 px-3">Draw ID</th>
                  <th className="py-2.5 px-3">Slag Stockpile Source</th>
                  <th className="py-2.5 px-3">Linked Repair Job</th>
                  <th className="py-2.5 px-3 text-right">Quantity Drawn</th>
                  <th className="py-2.5 px-3 text-right">Reclaimed Value (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {slagDraws.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-govBlue">DRAW #{d.id}</td>
                    <td className="py-2.5 px-3 text-gray-800 dark:text-gray-200">{d.tenant_unit_name}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-500">RepairJob #{d.repair_job_id}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">{d.kg_drawn} kg</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-600">₹{d.notional_value_inr.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AnalyticsPage;