import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MapPin, X, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { API_BASE_URL } from '../config';

const ReportPothole = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState('Location not set');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [userPotholeCount, setUserPotholeCount] = useState<number | string>('');

  // Detection method state
  const [detectionMethod, setDetectionMethod] = useState('YOLO (best.pt)');

  // Camera parameters state
  const [cameraHeight, setCameraHeight] = useState('1.2');
  const [tiltAngle, setTiltAngle] = useState('45');
  const [fovVertical, setFovVertical] = useState('55');
  const [fovHorizontal, setFovHorizontal] = useState('65');
  const [confThreshold, setConfThreshold] = useState('0.35');

  useEffect(() => {
    // Attempt to get location automatically on load
    getLocation();
  }, []);

  const geocodeCoordinates = async (lat: number, lng: number) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    try {
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await response.json();
      return data?.display_name || `Approx. ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
    } catch (error) {
      console.error('Failed to fetch geocoding data from Nominatim:', error);
      return `Approx. ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
    }
  };

  const getLocation = () => {
    setIsLocating(true);
    setLocationError(null);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ lat: latitude, lng: longitude });
          const address = await geocodeCoordinates(latitude, longitude);
          setLocation(address);
          setIsLocating(false);
        },
        (error) => {
          let errorMessage = 'Could not detect location.';
          if (error.code === error.PERMISSION_DENIED) errorMessage = 'Location permission denied by user.';
          setLocation('Location not detected');
          setLocationError(errorMessage);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocation('Location not detected');
      setLocationError('Geolocation is not supported by this browser.');
      setIsLocating(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) {
      throw new Error("Invalid data URL: MIME type not found.");
    }
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePreview) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.append('image', dataURLtoBlob(imagePreview), 'pothole.jpg');
    formData.append('detection_method', detectionMethod);
    formData.append('message', message);
    if (userPotholeCount) {
      formData.append('user_pothole_count', String(userPotholeCount));
    }

    if (detectionMethod === 'YOLO (best.pt)') {
      formData.append('camera_height_m', cameraHeight);
      formData.append('tilt_angle_deg', tiltAngle);
      formData.append('fov_vertical_deg', fovVertical);
      formData.append('fov_horizontal_deg', fovHorizontal);
      formData.append('conf_threshold', confThreshold);
    }

    // Send GPS coordinates to backend for segment matching and dedupe
    if (coords) {
      formData.append('lat', String(coords.lat));
      formData.append('lng', String(coords.lng));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
        setSubmitError("The request timed out. The AI model may be under heavy load. Please try again later.");
        setIsSubmitting(false);
    }, 60000); // 60 seconds timeout for potentially slow LLM calls

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST', 
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'An unknown error occurred.' }));
        throw new Error(errorData.detail || 'Analysis failed');
      }
      const result = await response.json();
      navigate('/ai-analysis', { state: { analysisResult: result } });
    } catch (error) {
      // @ts-ignore
      if (error.name === 'AbortError') {
        // Error already handled by timeout
      } else {
        setSubmitError((error as Error).message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-20 sm:pb-6">
      <h1 className="text-2xl sm:text-3xl font-bold">Report a Pothole</h1>
      <form onSubmit={handleSubmit} className="mt-4 space-y-6">
        {submitError && <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">{submitError}</div>}
        
        <div>
          <label className="block text-sm font-medium">Pothole Photo *</label>
          <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-xl ${imagePreview ? 'border-govBlue' : 'border-gray-300'}`}>
            <div className="space-y-1 text-center w-full">
              {imagePreview ? (
                <div className="relative w-full h-64">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                  <button type="button" onClick={() => setImagePreview(null)} className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full"><X className="w-5 h-5" /></button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center justify-center w-full sm:w-32 h-32 border-2 rounded-xl hover:border-govBlue"><Camera className="h-8 w-8 text-govBlue" /><span className="mt-2 text-sm">Camera</span></button>
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleImageChange} />
                  <div className="text-gray-400 sm:hidden">or</div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center w-full sm:w-32 h-32 border-2 rounded-xl hover:border-govBlue"><ImageIcon className="h-8 w-8 text-gray-500" /><span className="mt-2 text-sm">Gallery</span></button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="user_pothole_count" className="block text-sm font-medium">How many potholes do you see?</label>
          <input
            type="number"
            id="user_pothole_count"
            value={userPotholeCount}
            onChange={(e) => setUserPotholeCount(e.target.value)}
            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm"
            min="0"
          />
        </div>

        <div>
          <label htmlFor="detection_method" className="block text-sm font-medium">Detection Method</label>
          <select
            id="detection_method"
            value={detectionMethod}
            onChange={(e) => setDetectionMethod(e.target.value)}
            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm"
          >
            <option>YOLO (best.pt)</option>
            <option>LLM - Gemini</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium">Optional Message</label>
          <textarea
            id="message"
            rows={4}
            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {detectionMethod === 'YOLO (best.pt)' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 border rounded-lg">
            <h3 className="sm:col-span-2 text-lg font-medium">YOLOv8 Parameters</h3>
            <div>
              <label htmlFor="camera_height_m" className="block text-sm font-medium">Camera Height (m)</label>
              <input type="number" id="camera_height_m" value={cameraHeight} onChange={e => setCameraHeight(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="tilt_angle_deg" className="block text-sm font-medium">Tilt Angle (°)</label>
              <input type="number" id="tilt_angle_deg" value={tiltAngle} onChange={e => setTiltAngle(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="fov_vertical_deg" className="block text-sm font-medium">Vertical FOV (°)</label>
              <input type="number" id="fov_vertical_deg" value={fovVertical} onChange={e => setFovVertical(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="fov_horizontal_deg" className="block text-sm font-medium">Horizontal FOV (°)</label>
              <input type="number" id="fov_horizontal_deg" value={fovHorizontal} onChange={e => setFovHorizontal(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="conf_threshold" className="block text-sm font-medium">Confidence Threshold</label>
              <input type="number" step="0.1" min="0.1" max="0.9" id="conf_threshold" value={confThreshold} onChange={e => setConfThreshold(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm" />
            </div>
          </div>
        )}

        <div className="bg-gray-50 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-govBlue" />
              <div>
                <p className="text-sm font-medium">Detected Location</p>
                <p className="text-xs text-gray-600">{isLocating ? 'Fetching...' : location}</p>
              </div>
            </div>
            <button type="button" onClick={getLocation} className="flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs"><RefreshCw className="w-3 h-3" /> Retry</button>
          </div>
          {locationError && (
            <div className="mt-3 text-center">
              <p className="text-xs text-red-500 mb-2">{locationError}</p>
              <button type="button" onClick={getLocation} className="w-full text-white bg-blue-500 hover:bg-blue-600 font-medium rounded-lg text-sm px-5 py-2.5 text-center">
                Allow Location Access
              </button>
            </div>
          )}
        </div>

        <div className="pt-6 border-t">
          <button type="submit" disabled={!imagePreview || isSubmitting} className="w-full flex justify-center items-center py-3 px-4 border rounded-lg shadow-sm text-base font-medium text-white bg-accent-orange disabled:bg-gray-400">
            {isSubmitting ? 'Processing...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReportPothole;