import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import MapSnapshot from '../components/common/MapSnapshot';
import { ArrowLeft, Calendar, MapPin, AlertTriangle, CheckCircle, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ReportDetail {
    id: number;
    address?: string | null;
    status?: string | null;
    severity?: string | null;
    reportedDate?: string | null;
    lat?: number | null;
    lng?: number | null;
    [key: string]: any;
}

type TimelineColor = 'blue' | 'green' | 'purple';

const getSeverityClass = (severity?: string | null) => {
    switch (severity) {
        case 'High': return 'text-red-600 bg-red-100';
        case 'Medium': return 'text-yellow-600 bg-yellow-100';
        case 'Low': return 'text-green-600 bg-green-100';
        default: return 'text-gray-600 bg-gray-100';
    }
};

const getStatusClass = (status?: string | null) => {
    switch (status) {
        case 'Reported': return 'text-blue-600 bg-blue-100';
        case 'In Progress': return 'text-purple-600 bg-purple-100';
        case 'Fixed': return 'text-green-600 bg-green-100';
        default: return 'text-gray-600 bg-gray-100';
    }
};

const TimelineEvent = ({ icon: Icon, title, date, color, isLast }: {
    icon: LucideIcon;
    title: string;
    date?: string | null;
    color: TimelineColor;
    isLast?: boolean;
}) => {
    const colorClasses: Record<TimelineColor, string> = {
        blue: 'bg-blue-100 text-blue-600',
        green: 'bg-green-100 text-green-600',
        purple: 'bg-purple-100 text-purple-600',
    };

    return (
        <div className="flex">
            <div className="flex flex-col items-center mr-4">
                <div>
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${colorClasses[color]}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                </div>
                {!isLast && <div className="w-px h-full bg-gray-300" />}
            </div>
            <div className="pt-1.5 pb-8">
                <p className="mb-0.5 text-sm font-bold text-gray-800">{title}</p>
                {date ? (
                    <p className="text-sm text-gray-500">{new Date(date).toLocaleString()}</p>
                ) : (
                    <p className="text-sm text-gray-500 italic">In progress</p>
                )}
            </div>
        </div>
    );
};

const StatusTimeline = ({ report }: { report: ReportDetail }) => {
    const events: Array<{
        title: string;
        date?: string | null;
        icon: LucideIcon;
        color: TimelineColor;
    }> = [];

    events.push({
        title: 'Reported',
        date: report.reportedDate,
        icon: Calendar,
        color: 'blue'
    });

    if (report.status === 'In Progress') {
        events.push({
            title: 'In Progress',
            date: null,
            icon: Wrench,
            color: 'purple'
        });
    }

    if (report.fixedDate) {
        events.push({
            title: 'Fixed',
            date: report.fixedDate,
            icon: CheckCircle,
            color: 'green'
        });
    }

    return (
        <div>
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Report History</h3>
            {events.map((event, index) => (
                <TimelineEvent
                    key={index}
                    {...event}
                    isLast={index === events.length - 1}
                />
            ))}
        </div>
    );
};


const ReportDetailsPage = () => {
    const { reportId } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<ReportDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchReport = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' },
                });
                if (!response.ok) throw new Error('Failed to fetch report details.');
                const data = await response.json();
                setReport(data);
            } catch (err: any) {
                setError(err?.message || 'Failed to fetch report details.');
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [reportId]);

    if (loading) return <div className="p-8 text-center">Loading report...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    if (!report) return <div className="p-8 text-center">Report not found.</div>;

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="mb-6">
                    <button onClick={() => navigate(-1)} className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Reports
                    </button>
                </div>

                <div className="bg-white shadow-lg rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h1 className="text-3xl font-bold text-gray-900">Report #{report.id}</h1>
                        <p className="mt-1 text-sm text-gray-500 flex items-center">
                            <MapPin className="w-4 h-4 mr-2" />
                            {report.address}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6">
                        <div className="lg:col-span-3 space-y-6">
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800 mb-4">Images</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-center font-medium text-gray-700 mb-2">Original Photo</p>
                                        <img src={report.original_image_url} alt="Original pothole" className="w-full h-auto rounded-lg shadow-md" />
                                    </div>
                                    <div>
                                        <p className="text-center font-medium text-gray-700 mb-2">AI Annotated</p>
                                        <img src={report.annotated_image_url} alt="AI annotated pothole" className="w-full h-auto rounded-lg shadow-md" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Current Status</h3>
                                    <div className="flex flex-col items-start space-y-2">
                                        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusClass(report.status)}`}>
                                            {report.status}
                                        </span>
                                        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getSeverityClass(report.severity)}`}>
                                            {report.severity} Severity
                                        </span>
                                    </div>
                                </div>
                                
                                <StatusTimeline report={report} />

                                <div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-4">AI Assessment</h3>
                                    <div className="flex items-center">
                                        <AlertTriangle className="w-5 h-5 text-gray-400 mr-4" />
                                        <div>
                                            <p className="font-medium text-gray-700">Estimated Size</p>
                                            <p className="text-gray-600">{report.estSize}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-200">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Location</h3>
                        <div className="h-80 rounded-lg overflow-hidden border border-gray-200">
                            {report.lat != null && report.lng != null && (
                                <MapSnapshot lat={report.lat} lng={report.lng} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportDetailsPage;