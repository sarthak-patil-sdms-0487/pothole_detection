import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const AIAnalysis = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { analysisResult } = location.state || {};
  
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!analysisResult) {
    return <p>No analysis data available. Please submit a report first.</p>;
  }

  interface PotholeDetail {
    pothole_id_in_image: number;
    confidence: number;
    estimated_distance_m?: number | null;
    estimated_width_cm?: number | null;
    estimated_width_cm_range?: string | null;
    size_category?: string | null;
  }

  const {
    original_image_url,
    annotated_image_url,
    detection_method,
    pothole_details,
    user_pothole_count,
    camera_params,
    message,
  }: { pothole_details: PotholeDetail[]; [key: string]: any } = analysisResult;

  const isGeminiAnalysis = detection_method === 'LLM - Gemini';

  const geocodeCoordinates = async (lat: number, lng: number) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      return data?.display_name || `Approx. ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    } catch (error) {
      console.error('Failed to fetch geocoding data:', error);
      return `Approx. ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    }
  };

  const handleCreateReport = async () => {
    setIsSubmitting(true);
    setSubmitStatus(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const address = await geocodeCoordinates(latitude, longitude);

        let estSize = null;
        if (isGeminiAnalysis) {
          estSize = pothole_details.map(p => p.estimated_width_cm_range).join(', ');
        } else {
          const estimatedSizes = pothole_details
            .map((p) => p.estimated_width_cm)
            .filter((w): w is number => typeof w === 'number');
          if (estimatedSizes.length > 0) {
            estSize = estimatedSizes.length > 1 
              ? `${Math.min(...estimatedSizes).toFixed(1)} - ${Math.max(...estimatedSizes).toFixed(1)} cm`
              : `${estimatedSizes[0].toFixed(1)} cm`;
          }
        }

        const reportData = {
          original_image_url,
          annotated_image_url,
          detection_method,
          camera_params: camera_params || null,
          pothole_details,
          user_pothole_count,
          lat: latitude,
          lng: longitude,
          address: address,
          severity: 'Medium',
          reportedBy: 'Anonymous',
          estSize: estSize,
          message: message,
          status: 'Reported',
        };

        try {
          const response = await fetch(`${API_BASE_URL}/api/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(reportData),
          });

          if (!response.ok) {
            throw new Error('Failed to submit report. Please try again.');
          }

          setSubmitStatus({ type: 'success', message: 'Report submitted successfully!' });
          setTimeout(() => navigate('/my-reports'), 2000);
        } catch (error) {
          setSubmitStatus({ type: 'error', message: (error as Error).message });
        } finally {
          setIsSubmitting(false);
        }
      },
      () => {
        setSubmitStatus({ type: 'error', message: 'Could not get location. Please enable location services.' });
        setIsSubmitting(false);
      }
    );
  };

  const handleGoBack = () => navigate(-1);
  const handleImageClick = (imageUrl: string) => setZoomedImage(imageUrl);
  const handleCloseZoom = () => setZoomedImage(null);

  const renderYoloTable = () => (
    <table className="min-w-full bg-white rounded-lg shadow">
      <thead className="w-full bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
        <tr>
          <th className="py-3 px-6 text-left">ID</th>
          <th className="py-3 px-6 text-left">Confidence</th>
          <th className="py-3 px-6 text-left">Est. Distance (m)</th>
          <th className="py-3 px-6 text-left">Est. Width (cm)</th>
        </tr>
      </thead>
      <tbody className="text-gray-600 text-sm font-light">
        {pothole_details.map((pothole) => (
          <tr key={pothole.pothole_id_in_image} className="border-b border-gray-200 hover:bg-gray-100">
            <td className="py-3 px-6 text-left whitespace-nowrap">{pothole.pothole_id_in_image}</td>
            <td className="py-3 px-6 text-left">{(pothole.confidence * 100).toFixed(2)}%</td>
            <td className="py-3 px-6 text-left">{pothole.estimated_distance_m ?? 'N/A'}</td>
            <td className="py-3 px-6 text-left">{pothole.estimated_width_cm?.toFixed(1) ?? 'N/A'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderGeminiTable = () => (
    <table className="min-w-full bg-white rounded-lg shadow">
      <thead className="w-full bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
        <tr>
          <th className="py-3 px-6 text-left">ID</th>
          <th className="py-3 px-6 text-left">Confidence</th>
          <th className="py-3 px-6 text-left">Size Category</th>
          <th className="py-3 px-6 text-left">Est. Width Range (cm)</th>
        </tr>
      </thead>
      <tbody className="text-gray-600 text-sm font-light">
        {pothole_details.map((pothole) => (
          <tr key={pothole.pothole_id_in_image} className="border-b border-gray-200 hover:bg-gray-100">
            <td className="py-3 px-6 text-left whitespace-nowrap">{pothole.pothole_id_in_image}</td>
            <td className="py-3 px-6 text-left">{pothole.confidence ? `${(pothole.confidence * 100).toFixed(2)}%` : 'N/A'}</td>
            <td className="py-3 px-6 text-left">{pothole.size_category ?? 'N/A'}</td>
            <td className="py-3 px-6 text-left">{pothole.estimated_width_cm_range ?? 'N/A'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderYoloCards = () => (
    <div className="md:hidden space-y-4">
      {pothole_details.map(pothole => (
        <div key={pothole.pothole_id_in_image} className="bg-white p-4 rounded-lg shadow">
          <div className="font-bold text-lg mb-2">Pothole #{pothole.pothole_id_in_image}</div>
          <div><strong>Confidence:</strong> {(pothole.confidence * 100).toFixed(2)}%</div>
          <div><strong>Est. Distance:</strong> {pothole.estimated_distance_m ?? 'N/A'} m</div>
          <div><strong>Est. Width:</strong> {pothole.estimated_width_cm?.toFixed(1) ?? 'N/A'} cm</div>
        </div>
      ))}
    </div>
  );

  const renderGeminiCards = () => (
    <div className="md:hidden space-y-4">
      {pothole_details.map(pothole => (
        <div key={pothole.pothole_id_in_image} className="bg-white p-4 rounded-lg shadow">
          <div className="font-bold text-lg mb-2">Pothole #{pothole.pothole_id_in_image}</div>
          <div><strong>Confidence:</strong> {pothole.confidence ? `${(pothole.confidence * 100).toFixed(2)}%` : 'N/A'}</div>
          <div><strong>Size Category:</strong> {pothole.size_category ?? 'N/A'}</div>
          <div><strong>Est. Width Range:</strong> {pothole.estimated_width_cm_range ?? 'N/A'}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Pothole Analysis Results</h1>
      
      {submitStatus && (
        <div className={`p-4 mb-4 text-sm rounded-lg ${submitStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {submitStatus.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p><strong>Your Pothole Count:</strong> {user_pothole_count || 'Not provided'}</p>
        </div>
        <div>
          <p><strong>AI Detected Potholes:</strong> {pothole_details.length}</p>
        </div>
        {detection_method && (
          <div className="sm:col-span-2">
            <p><strong>Analysis Model:</strong> {detection_method}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="text-xl font-semibold mb-2">Original Image</h2>
          <img src={original_image_url} alt="Original" className="rounded-lg shadow-md cursor-pointer" onClick={() => handleImageClick(original_image_url)} />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Annotated Image</h2>
          <img src={annotated_image_url} alt="Annotated" className="rounded-lg shadow-md cursor-pointer" onClick={() => handleImageClick(annotated_image_url)} />
        </div>
      </div>

      {zoomedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={handleCloseZoom}>
          <div className="relative p-4">
            <img src={zoomedImage} alt="Zoomed" className="max-h-[90vh] max-w-[90vw]" />
            <button onClick={handleCloseZoom} className="absolute top-0 right-0 m-4 text-white text-3xl">&times;</button>
          </div>
        </div>
      )}

      {pothole_details && pothole_details.length > 0 ? (
        <div className="my-8 text-center">
          <button onClick={handleCreateReport} disabled={isSubmitting} className="w-full md:w-auto bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-400">
            {isSubmitting ? 'Submitting...' : 'Create Report'}
          </button>
        </div>
      ) : (
        <div className="my-8 text-center">
          <p className="mb-4">No potholes were detected in the image.</p>
          <button onClick={handleGoBack} className="w-full md:w-auto bg-gray-500 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg">
            Go Back
          </button>
        </div>
      )}

      {pothole_details && pothole_details.length > 0 && (
        <>
          <h2 className="text-2xl font-bold mb-4">Pothole Details</h2>
          <div className="hidden md:block overflow-x-auto">
            {isGeminiAnalysis ? renderGeminiTable() : renderYoloTable()}
          </div>
          <div className="md:hidden space-y-4">
            {isGeminiAnalysis ? renderGeminiCards() : renderYoloCards()}
          </div>
        </>
      )}
    </div>
  );
};

export default AIAnalysis;