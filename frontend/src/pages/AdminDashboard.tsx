import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  MapPin, 
  Sparkles, 
  CheckCircle2, 
  X, 
  Calendar,
  IndianRupee,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config';

interface SegmentBrief {
  id: number;
  name: string;
  length_m: number;
  owner: string;
  has_active_dlp: boolean;
  traffic_class: string;
}

interface Tender {
  id: number;
  tender_ref: string;
  contractor_name: string;
  contractor_contact_email: string;
  description: string;
  award_date: string;
  completion_date: string;
  value_inr: number;
  dlp_years: number;
  dlp_expiry_date: string;
  source_url: string;
  dlp_source: string;
  segment_ids: number[];
  is_active_dlp: boolean;
}

const AdminDashboard: React.FC = () => {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [segments, setSegments] = useState<SegmentBrief[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterActive, setFilterActive] = useState<string>('all'); // all | active | expired
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [formData, setFormData] = useState({
    tender_ref: '',
    contractor_name: '',
    contractor_contact_email: '',
    description: '',
    award_date: '',
    completion_date: '',
    value_inr: '',
    dlp_years: '3.0',
    dlp_expiry_date: '',
    source_url: '',
    dlp_source: '',
    segment_ids: [] as number[]
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch Tenders & Road Segments
  const fetchData = async () => {
    setLoading(true);
    try {
      const [tendersRes, segmentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/tenders`, { headers: { 'X-Role': 'ENGINEER' } }),
        fetch(`${API_BASE_URL}/api/tenders/segments`, { headers: { 'X-Role': 'ENGINEER' } })
      ]);

      if (tendersRes.ok) {
        const tData = await tendersRes.json();
        setTenders(tData);
      }
      if (segmentsRes.ok) {
        const sData = await segmentsRes.json();
        setSegments(sData);
      }
    } catch (err: any) {
      console.error('Failed to load tenders or segments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingTender(null);
    setFormData({
      tender_ref: '',
      contractor_name: '',
      contractor_contact_email: '',
      description: '',
      award_date: '',
      completion_date: '',
      value_inr: '',
      dlp_years: '3.0',
      dlp_expiry_date: '',
      source_url: '',
      dlp_source: 'Clause 35.1 Special Conditions (3 Years Defect Liability)',
      segment_ids: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = (t: Tender) => {
    setEditingTender(t);
    setFormData({
      tender_ref: t.tender_ref || '',
      contractor_name: t.contractor_name || '',
      contractor_contact_email: t.contractor_contact_email || '',
      description: t.description || '',
      award_date: t.award_date || '',
      completion_date: t.completion_date || '',
      value_inr: t.value_inr ? t.value_inr.toString() : '',
      dlp_years: t.dlp_years ? t.dlp_years.toString() : '3.0',
      dlp_expiry_date: t.dlp_expiry_date || '',
      source_url: t.source_url || '',
      dlp_source: t.dlp_source || '',
      segment_ids: t.segment_ids || []
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    const payload = {
      ...formData,
      value_inr: formData.value_inr ? parseFloat(formData.value_inr) : null,
      dlp_years: formData.dlp_years ? parseFloat(formData.dlp_years) : 3.0,
      award_date: formData.award_date || null,
      completion_date: formData.completion_date || null,
      dlp_expiry_date: formData.dlp_expiry_date || null,
    };

    try {
      const url = editingTender
        ? `${API_BASE_URL}/api/tenders/${editingTender.id}`
        : `${API_BASE_URL}/api/tenders`;
      
      const res = await fetch(url, {
        method: editingTender ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Role': 'ENGINEER' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Failed to save tender. Server returned ${res.status}`);
      }

      setStatusMessage({
        type: 'success',
        text: `Tender ${editingTender ? 'updated' : 'registered'} successfully!`
      });
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTender = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this tender contract record?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/tenders/${id}`, {
        method: 'DELETE',
        headers: { 'X-Role': 'ENGINEER' }
      });
      if (res.ok) {
        setTenders((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const toggleSegmentSelection = (segId: number) => {
    setFormData((prev) => {
      const exists = prev.segment_ids.includes(segId);
      return {
        ...prev,
        segment_ids: exists
          ? prev.segment_ids.filter((id) => id !== segId)
          : [...prev.segment_ids, segId]
      };
    });
  };

  // Filtered list
  const filteredTenders = tenders.filter((t) => {
    const matchesSearch = 
      (t.tender_ref && t.tender_ref.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.contractor_name && t.contractor_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterActive === 'active') return matchesSearch && t.is_active_dlp;
    if (filterActive === 'expired') return matchesSearch && !t.is_active_dlp;
    return matchesSearch;
  });

  const activeTendersCount = tenders.filter((t) => t.is_active_dlp).length;
  const totalValueCr = (tenders.reduce((acc, t) => acc + (t.value_inr || 0), 0) / 10000000).toFixed(2);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Contractor Compliance Register
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
            Tender & Defect Liability (DLP) Admin
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Maintain statutory contract awards, Defect Liability Periods (DLP), and road segment attribution mappings for Maharashtra PWD/MIDC industrial estates.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-5 py-3 rounded-xl font-bold bg-govBlue hover:bg-blue-700 text-white flex items-center gap-2 shadow-md transition-all active:scale-95 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Tender Contract
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Tenders</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{tenders.length}</p>
          <p className="text-xs text-gray-400 mt-1">Seeded from MahaTenders</p>
        </div>

        <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Active in DLP
          </p>
          <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{activeTendersCount}</p>
          <p className="text-xs text-emerald-600/80 mt-1">Contractor liable for 48h repair</p>
        </div>

        <div className="bg-blue-50/60 dark:bg-blue-950/20 p-5 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Road Segments
          </p>
          <p className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">{segments.length}</p>
          <p className="text-xs text-blue-600/80 mt-1">In pilot estate gazetteer</p>
        </div>

        <div className="bg-purple-50/60 dark:bg-purple-950/20 p-5 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-sm">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
            <IndianRupee className="w-3.5 h-3.5" /> Total Contract Value
          </p>
          <p className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1">₹{totalValueCr} Cr</p>
          <p className="text-xs text-purple-600/80 mt-1">Infrastructure works value</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row gap-3 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by tender ref, contractor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-govBlue"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-gray-500 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterActive === 'all'
                ? 'bg-govBlue text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            All ({tenders.length})
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterActive === 'active'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Active DLP ({activeTendersCount})
          </button>
          <button
            onClick={() => setFilterActive('expired')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterActive === 'expired'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Expired ({tenders.length - activeTendersCount})
          </button>
        </div>
      </div>

      {/* Tenders Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading tender records...</div>
        ) : filteredTenders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No tender contracts found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700 text-xs">
                <tr>
                  <th className="py-3 px-4">Tender Reference</th>
                  <th className="py-3 px-4">Contractor</th>
                  <th className="py-3 px-4">Mapped Segments</th>
                  <th className="py-3 px-4">Completion Date</th>
                  <th className="py-3 px-4">DLP Expiry</th>
                  <th className="py-3 px-4">Value (₹)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredTenders.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-govBlue dark:text-blue-400">
                      {t.tender_ref || `TND-${t.id}`}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-gray-900 dark:text-white">{t.contractor_name}</p>
                      <p className="text-xs text-gray-400">{t.contractor_contact_email || 'No email registered'}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      {t.segment_ids && t.segment_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.segment_ids.map((sId) => (
                            <span
                              key={sId}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                            >
                              Seg #{sId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No segments mapped</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-300">
                      {t.completion_date || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <span className={t.is_active_dlp ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-gray-400'}>
                        {t.dlp_expiry_date || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {t.value_inr ? `₹${(t.value_inr / 100000).toFixed(1)} L` : '--'}
                    </td>
                    <td className="py-3.5 px-4">
                      {t.is_active_dlp ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> In Warranty
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          Expired
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(t)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                          title="Edit Tender"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTender(t.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
                          title="Delete Tender"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Create / Edit */}
      <AnimatePresence>
        {isModalOpen && (
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
              className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-5"
            >
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {editingTender ? 'Edit Road Tender Contract' : 'Register New Road Tender'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Tender Reference No. *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MIDC/EE/PUNE/2024/TR-01"
                      value={formData.tender_ref}
                      onChange={(e) => setFormData({ ...formData, tender_ref: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Contractor Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. B.G. Shirke Construction Pvt Ltd"
                      value={formData.contractor_name}
                      onChange={(e) => setFormData({ ...formData, contractor_name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Contractor Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. contracts@contractor.com"
                      value={formData.contractor_contact_email}
                      onChange={(e) => setFormData({ ...formData, contractor_contact_email: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Contract Value (INR)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 24500000"
                      value={formData.value_inr}
                      onChange={(e) => setFormData({ ...formData, value_inr: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Work Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Resurfacing and Bituminous Macadam overlay..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Completion Date
                    </label>
                    <input
                      type="date"
                      value={formData.completion_date}
                      onChange={(e) => setFormData({ ...formData, completion_date: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      DLP Years
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="3.0"
                      value={formData.dlp_years}
                      onChange={(e) => setFormData({ ...formData, dlp_years: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      DLP Expiry Date
                    </label>
                    <input
                      type="date"
                      value={formData.dlp_expiry_date}
                      onChange={(e) => setFormData({ ...formData, dlp_expiry_date: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    DLP Source Clause Rationale
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Clause 35.1 Special Conditions (36 Months DLP)"
                    value={formData.dlp_source}
                    onChange={(e) => setFormData({ ...formData, dlp_source: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-govBlue"
                  />
                </div>

                {/* Road Segment Multi-selection */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Governing Road Segments ({formData.segment_ids.length} selected)
                  </label>
                  <div className="max-h-44 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {segments.map((seg) => {
                      const isSelected = formData.segment_ids.includes(seg.id);
                      return (
                        <div
                          key={seg.id}
                          onClick={() => toggleSegmentSelection(seg.id)}
                          className={`p-2 rounded-lg cursor-pointer text-xs flex items-center gap-2 border transition-all ${
                            isSelected
                              ? 'bg-govBlue text-white border-govBlue'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-govBlue/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded text-govBlue"
                          />
                          <span className="truncate font-medium">
                            #{seg.id} - {seg.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-sm font-bold rounded-xl bg-govBlue hover:bg-blue-700 text-white shadow"
                  >
                    {isSubmitting ? 'Saving...' : editingTender ? 'Update Contract' : 'Save Contract'}
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

export default AdminDashboard;