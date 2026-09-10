import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, Loader, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { API_BASE_URL } from '../config';
import { useAuthStore, authFetch } from '../store/authStore';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Defect {
  id: number;
  segment_id?: number;
  segment_name?: string;
  state: 'SIGHTING' | 'CONFIRMED' | 'NOTICED' | 'CLOSED';
  sla_hours_remaining?: number;
  breach_flag: boolean;
  repeat_sighting_count: number;
  latest_verdict?: {
    verdict: string;
  };
  sightings: {
    lat?: number;
    lng?: number;
    original_image_url: string;
  }[];
}

const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const MapPage = () => {
  const { role } = useAuthStore();
  const [mapCenter] = useState<L.LatLngExpression>([18.755, 73.785]); // Centered on MIDC Chakan Phase II
  const [filter, setFilter] = useState<string>('ALL');
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDefects = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`${API_BASE_URL}/api/defects`);
        if (!res.ok) throw new Error('Failed to fetch defect spatial data');
        const data: Defect[] = await res.json();
        setDefects(data.filter(d => d.sightings.length > 0 && d.sightings[0].lat && d.sightings[0].lng));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDefects();
  }, [role]);

const greyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const getDefectIcon = (d: Defect) => {
  if (d.state === 'CLOSED') return greenIcon;
  if (d.state === 'NOTICED') return redIcon;
  if (d.state === 'CONFIRMED') return orangeIcon;
  return greyIcon; // SIGHTING
};

  const filteredDefects = defects.filter(d => filter === 'ALL' || d.state === filter);

  return (
    <div className="relative h-[calc(100dvh-9rem)] min-h-[480px] w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Top Filter Floating Card */}
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-govBlue" />
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)} 
            className="bg-transparent font-bold text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-govBlue"
          >
            <option value="ALL">All Defects ({defects.length})</option>
            <option value="SIGHTING">Sighting (Blue)</option>
            <option value="CONFIRMED">Confirmed (Purple)</option>
            <option value="NOTICED">Noticed - 48h SLA (Orange/Red)</option>
            <option value="CLOSED">Closed (Green)</option>
          </select>
        </div>
        {loading && <Loader className="w-4 h-4 animate-spin text-govBlue" />}
        {error && (
          <span title={error} className="inline-flex">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </span>
        )}
      </div>

      <MapContainer center={mapCenter} zoom={14} className="h-full w-full z-0" zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors | MIDC Chakan GIS"
        />

        {filteredDefects.map((d) => {
          const pos = d.sightings[0];
          if (!pos.lat || !pos.lng) return null;
          return (
            <Marker
              key={d.id}
              position={[pos.lat, pos.lng]}
              icon={getDefectIcon(d)}
            >
              <Popup>
                <div className="p-1 max-w-[220px] space-y-2 text-xs">
                  {pos.original_image_url && (
                    <img src={pos.original_image_url} alt="Pothole" className="w-full h-24 object-cover rounded-lg" />
                  )}
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold font-mono text-govBlue">Defect #{d.id}</span>
                      <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-gray-100 uppercase">{d.state}</span>
                    </div>
                    <p className="font-semibold text-gray-800 text-[11px] truncate mt-0.5">{d.segment_name || `Segment #${d.segment_id}`}</p>
                    <p className="text-gray-500 text-[10px]">Warranty: {d.latest_verdict?.verdict || 'Unassigned'}</p>
                    {d.state === 'NOTICED' && (
                      <p className="text-amber-600 font-bold text-[10px] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {d.breach_flag ? 'SLA Breached' : `${d.sla_hours_remaining}h SLA left`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => navigate('/review')}
                    className="w-full bg-govBlue hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                  >
                    Inspect in Review <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 text-[11px] space-y-2">
        <p className="font-extrabold text-gray-900 dark:text-white uppercase tracking-wider text-[10px]">Defect Lifecycle Pins</p>
        <div className="space-y-1.5 font-medium text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            <span>SIGHTING (Intake)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />
            <span>CONFIRMED (Cluster)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
            <span>NOTICED (48h Clock)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block animate-pulse" />
            <span>SLA BREACHED</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span>CLOSED (Certified)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapPage;