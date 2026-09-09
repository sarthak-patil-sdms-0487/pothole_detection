import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, 
  Play, 
  Square, 
  AlertTriangle, 
  Navigation, 
  ShieldCheck, 
  Activity, 
  Crosshair,
  RefreshCw,
  UploadCloud,
  Film,
  Video,
  FileVideo,
  Layers,
  Sparkles,
  Sliders,
  Filter,
  Brain,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config';
import { authFetch } from '../store/authStore';

interface ActiveTrack {
  trackId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lat: number;
  lng: number;
  seenCount: number;
  bestConfidence: number;
  lastBox: { x1: number; y1: number; x2: number; y2: number };
  lastReportedAt: number; // cooldown timer for POSTs
}

interface CaptureLog {
  id: string;
  timestamp: Date;
  lat: number;
  lng: number;
  speed: number | null;
  potholeCount: number;
  status: 'detecting' | 'clean' | 'pothole_found' | 'error';
  annotatedImageUrl?: string;
  originalImageUrl?: string;
  confidences?: number[];
  trackId?: string;
  isDuplicateMerged?: boolean;
}

interface OverlayBox {
  x1: number; y1: number; x2: number; y2: number;
  confidence: number;
  label: string;
  fadeStart: number;
}

// Distance calculation in meters using Haversine formula
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const REPORT_COOLDOWN_MS = 5000; // 5s cooldown per track before posting again

const DriveMode: React.FC = () => {
  const [sourceMode, setSourceMode] = useState<'video' | 'camera'>('video');
  const [isActive, setIsActive] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [timeIntervalSeconds, setTimeIntervalSeconds] = useState<number>(2);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.40); // 40% — below this the detector starts boxing clean road; above ~0.5 it drops real potholes
  const [detectionMode, setDetectionMode] = useState<'yolo' | 'gemini'>('yolo');
  
  // Telemetry metrics
  const [capturedFramesCount, setCapturedFramesCount] = useState<number>(0);
  const [uniqueDefectsCount, setUniqueDefectsCount] = useState<number>(0);
  const [deduplicatedSightingsCount, setDeduplicatedSightingsCount] = useState<number>(0);
  
  const [logs, setLogs] = useState<CaptureLog[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraFacing] = useState<'environment' | 'user'>('environment');
  const [lastDetectionResult, setLastDetectionResult] = useState<string | null>(null);
  
  // Video file state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Survey run state (Component D)
  const [surveyRunId, setSurveyRunId] = useState<number | null>(null);

  // Live canvas overlay boxes (Component A)
  const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayAnimRef = useRef<number | null>(null);

  // Smooth simulated road progression along MIDC Chakan Ph-2
  const simLatRef = useRef<number>(18.7512);
  const simLngRef = useRef<number>(73.7812);
  const simHeadingRef = useRef<number>(0.00008);

  // Ref always holds the latest GPS position — bypasses stale-closure in setInterval
  const currentPositionRef = useRef<GeolocationPosition | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Active persistent pothole tracking list
  const tracksListRef = useRef<ActiveTrack[]>([]);
  const trackCounterRef = useRef<number>(1);

  // Handle uploaded video file
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setErrorMsg(null);
      setLastDetectionResult(null);
      tracksListRef.current = [];
    }
  };

  // Request Wake Lock
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      }
    } catch (err: any) {
      console.warn('Wake Lock request failed:', err.message);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Start live camera stream
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      setErrorMsg(`Camera error: ${err.message}. Switch to "Upload Dashcam Video" if testing without a webcam.`);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // ─── Canvas Overlay Drawing (Component A) ──────────────────────────────────
  const drawOverlayBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to displayed video
    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();
    const scaleX = canvas.width / (video.videoWidth || 1);
    const scaleY = canvas.height / (video.videoHeight || 1);

    const boxes = overlayBoxes.filter(b => now - b.fadeStart < 3000);

    boxes.forEach((box) => {
      const age = now - box.fadeStart;
      const alpha = Math.max(0, 1 - age / 3000);

      const x1 = box.x1 * scaleX;
      const y1 = box.y1 * scaleY;
      const x2 = box.x2 * scaleX;
      const y2 = box.y2 * scaleY;
      const w = x2 - x1;
      const h = y2 - y1;

      // Glowing green bounding box
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 8;
      ctx.strokeRect(x1, y1, w, h);

      // Label background
      const label = box.label;
      ctx.font = 'bold 12px Inter, sans-serif';
      const textMetrics = ctx.measureText(label);
      const labelW = textMetrics.width + 10;
      const labelH = 20;
      ctx.fillStyle = 'rgba(0, 255, 136, 0.85)';
      ctx.shadowBlur = 0;
      ctx.fillRect(x1, Math.max(0, y1 - labelH), labelW, labelH);

      // Label text
      ctx.fillStyle = '#000';
      ctx.globalAlpha = alpha;
      ctx.fillText(label, x1 + 5, Math.max(14, y1 - 5));
      ctx.restore();
    });

    // Cleanup expired boxes
    if (boxes.length < overlayBoxes.length) {
      setOverlayBoxes(boxes);
    }

    overlayAnimRef.current = requestAnimationFrame(drawOverlayBoxes);
  }, [overlayBoxes]);

  // Start / stop overlay animation loop
  useEffect(() => {
    if (isActive && overlayBoxes.length > 0) {
      overlayAnimRef.current = requestAnimationFrame(drawOverlayBoxes);
    }
    return () => {
      if (overlayAnimRef.current) {
        cancelAnimationFrame(overlayAnimRef.current);
      }
    };
  }, [isActive, overlayBoxes, drawOverlayBoxes]);

  // ─── Frame Capture & Analysis ──────────────────────────────────────────────
  const captureAndAnalyzeFrame = useCallback(async () => {
    if (!videoRef.current || isProcessing) return;

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused) return;

    setIsProcessing(true);
    const logId = Math.random().toString(36).substring(2, 9);
    
    // Compute vehicle coordinates — real GPS when available, simulated for video mode
    const livePos = currentPositionRef.current;
    const hasRealGPS =
      livePos !== null &&
      (livePos.coords.latitude !== 0 || livePos.coords.longitude !== 0);

    let lat: number;
    let lng: number;
    let speed: number | null;

    if (sourceMode === 'video' || !hasRealGPS) {
      simLatRef.current += simHeadingRef.current * (0.8 + Math.random() * 0.4);
      simLngRef.current += simHeadingRef.current * (0.8 + Math.random() * 0.4);
      lat = simLatRef.current;
      lng = simLngRef.current;
      speed = 7.5;
    } else {
      lat = livePos.coords.latitude;
      lng = livePos.coords.longitude;
      speed = livePos.coords.speed;
    }

    // Downscale on offscreen canvas for fast background inference (~50ms)
    const scale = Math.min(1.0, 960 / Math.max(video.videoWidth, 1));
    const targetW = Math.round(video.videoWidth * scale);
    const targetH = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    // Non-blocking snapshot
    ctx.drawImage(video, 0, 0, targetW, targetH);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsProcessing(false);
        return;
      }

      setCapturedFramesCount((prev) => prev + 1);

      const initialLog: CaptureLog = {
        id: logId,
        timestamp: new Date(),
        lat,
        lng,
        speed,
        potholeCount: 0,
        status: 'detecting',
      };
      setLogs((prev) => [initialLog, ...prev.slice(0, 19)]);

      try {
        const formData = new FormData();
        formData.append('image', blob, `drive_${logId}.jpg`);
        formData.append('detection_method', detectionMode === 'gemini' ? 'LLM - Gemini' : 'YOLO (best.pt)');
        formData.append('conf_threshold', confidenceThreshold.toString());
        formData.append('capture_source', 'OPPORTUNISTIC');
        // Clean frames are analysed but not stored: keeps the overlay responsive
        // and stops the bucket filling with pictures of empty road.
        formData.append('store_clean_frames', 'false');

        const response = await fetch(`${API_BASE_URL}/api/analyze`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error(`Analyze error: ${response.status}`);

        const result = await response.json();
        const potholes = result.pothole_details || [];
        const potholeCount = potholes.length;
        const now = Date.now();

        // Component A: Push bounding boxes to overlay canvas
        if (potholeCount > 0) {
          const newBoxes: OverlayBox[] = potholes.map((p: any, i: number) => ({
            x1: p.box_pixels?.x1 || 0,
            y1: p.box_pixels?.y1 || 0,
            x2: p.box_pixels?.x2 || 0,
            y2: p.box_pixels?.y2 || 0,
            confidence: p.confidence || 0,
            label: `#${i + 1} ${((p.confidence || 0) * 100).toFixed(0)}%`,
            fadeStart: now,
          }));
          setOverlayBoxes((prev) => [...newBoxes, ...prev.filter(b => now - b.fadeStart < 3000)]);
        }

        if (potholeCount > 0) {
          let hasBrandNewPothole = false;
          let activeTrackId = '';

          potholes.forEach((p: any) => {
            const conf = p.confidence;
            const boxPixels = p.box_pixels;

            // Check if this detection matches an existing active track (within 18m radius or temporal window)
            const matchingTrack = tracksListRef.current.find((t) => {
              const dist = calculateDistanceMeters(lat, lng, t.lat, t.lng);
              const timeDiff = now - t.lastSeenAt;
              return dist <= 18.0 || timeDiff < 4000;
            });

            if (matchingTrack) {
              matchingTrack.lastSeenAt = now;
              matchingTrack.seenCount += 1;
              matchingTrack.bestConfidence = Math.max(matchingTrack.bestConfidence, conf);
              matchingTrack.lastBox = boxPixels;
              activeTrackId = matchingTrack.trackId;

              setDeduplicatedSightingsCount((prev) => prev + 1);
            } else {
              const newTrackId = `TRACK-${String(trackCounterRef.current++).padStart(2, '0')}`;
              activeTrackId = newTrackId;
              hasBrandNewPothole = true;

              const createdTrack: ActiveTrack = {
                trackId: newTrackId,
                firstSeenAt: now,
                lastSeenAt: now,
                lat,
                lng,
                seenCount: 1,
                bestConfidence: conf,
                lastBox: boxPixels,
                lastReportedAt: 0,
              };

              tracksListRef.current.push(createdTrack);
              if (tracksListRef.current.length > 50) {
                tracksListRef.current.shift();
              }

              setUniqueDefectsCount((prev) => prev + 1);
            }
          });

          // Component C: Cooldown — only POST if brand new OR cooldown expired
          const targetTrack = tracksListRef.current.find(t => t.trackId === activeTrackId);
          const shouldPost = hasBrandNewPothole || (targetTrack && (now - targetTrack.lastReportedAt > REPORT_COOLDOWN_MS));

          if (shouldPost) {
            if (targetTrack) targetTrack.lastReportedAt = now;

            const reportPayload: any = {
              original_image_url: result.original_image_url || '',
              annotated_image_url: result.annotated_image_url || '',
              detection_method: detectionMode === 'gemini' ? 'LLM - Gemini' : 'YOLO (best.pt)',
              camera_params: result.camera_params,
              pothole_details: potholes,
              user_pothole_count: potholeCount,
              lat,
              lng,
              status: 'SIGHTING',
              reportedBy: sourceMode === 'video' ? 'Dashcam Stream' : 'Live Dashcam Mode',
              capture_source: 'OPPORTUNISTIC',
              severity: potholeCount > 2 ? 'High' : potholeCount > 1 ? 'Medium' : 'Low',
            };

            // Tag with survey run if available
            if (surveyRunId) {
              reportPayload.survey_run_id = surveyRunId;
            }

            try {
              await authFetch(`${API_BASE_URL}/api/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reportPayload),
              });
            } catch (err) {
              console.error('Failed to post report:', err);
            }
          }

          setLastDetectionResult(
            hasBrandNewPothole
              ? `⭐ New Defect ${activeTrackId} Discovered (${(potholes[0].confidence*100).toFixed(0)}%)`
              : `🔄 Track ${activeTrackId} Updated (${tracksListRef.current.find(t=>t.trackId===activeTrackId)?.seenCount || 1} frames merged)`
          );

          setLogs((prev) =>
            prev.map((item) =>
              item.id === logId
                ? {
                    ...item,
                    potholeCount,
                    status: 'pothole_found',
                    annotatedImageUrl: result.annotated_image_url,
                    originalImageUrl: result.original_image_url,
                    trackId: activeTrackId,
                    isDuplicateMerged: !hasBrandNewPothole,
                  }
                : item
            )
          );
        } else {
          setLastDetectionResult(`Clean road surface (Threshold: ${(confidenceThreshold*100).toFixed(0)}%)`);
          setLogs((prev) =>
            prev.map((item) =>
              item.id === logId
                ? { ...item, status: 'clean', potholeCount: 0 }
                : item
            )
          );
        }
      } catch (err: any) {
        console.error('Frame processing failed:', err);
        setLogs((prev) =>
          prev.map((item) =>
            item.id === logId ? { ...item, status: 'error' } : item
          )
        );
      } finally {
        setIsProcessing(false);
      }
    }, 'image/jpeg', 0.88);
  }, [confidenceThreshold, isProcessing, sourceMode, detectionMode, surveyRunId]);

  // Start / Stop Continuous Drive Mode
  const toggleDriveMode = async () => {
    if (isActive) {
      setIsActive(false);
      releaseWakeLock();
      if (sourceMode === 'camera') {
        stopCamera();
      } else if (videoRef.current) {
        videoRef.current.pause();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // End the survey run (Component D)
      if (surveyRunId) {
        try {
          await authFetch(`${API_BASE_URL}/api/survey-runs/${surveyRunId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              total_frames: capturedFramesCount,
              defects_found: uniqueDefectsCount,
            }),
          });
        } catch (err) {
          console.error('Failed to end survey run:', err);
        }
        setSurveyRunId(null);
      }
    } else {
      setErrorMsg(null);

      // Start a new survey run (Component D)
      try {
        const runResp = await authFetch(`${API_BASE_URL}/api/survey-runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_type: sourceMode,
            operator_name: 'Surveyor',
          }),
        });
        if (runResp.ok) {
          const runData = await runResp.json();
          setSurveyRunId(runData.id);
        }
      } catch (err) {
        console.error('Failed to create survey run:', err);
      }

      if (sourceMode === 'camera') {
        await startCamera();
      } else {
        if (!videoSrc) {
          setErrorMsg('Please choose a dashcam video file first!');
          return;
        }
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          await videoRef.current.play();
        }
      }
      await requestWakeLock();

      // Continuous background sampling interval (smooth, non-intrusive)
      timerRef.current = setInterval(() => {
        captureAndAnalyzeFrame();
      }, timeIntervalSeconds * 1000);

      // Trigger initial frame
      setTimeout(() => {
        captureAndAnalyzeFrame();
      }, 500);

      setIsActive(true);
    }
  };

  // Wire up live GPS watcher — keeps currentPositionRef always fresh
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      console.warn('[GPS] Geolocation API not available in this browser/context.');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPosition(pos);
        currentPositionRef.current = pos;
      },
      (err) => console.warn('[GPS] watchPosition error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseWakeLock();
      stopCamera();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (overlayAnimRef.current) {
        cancelAnimationFrame(overlayAnimRef.current);
      }
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6 min-w-0">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-govBlue to-blue-900 text-white rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/30 text-blue-200 border border-blue-400/30 flex items-center gap-1">
                <Crosshair className="w-3 h-3" /> Continuous Smooth Drive Mode
              </span>
              {surveyRunId && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Run #{surveyRunId}
                </span>
              )}
              {wakeLockActive && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Screen Active
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">SIDC Road Survey</h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-0.5 max-w-xl leading-snug">
              Clean, uninterrupted video playback at full speed. Road frames are scanned in the background and grouped to prevent duplicate entries.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={toggleDriveMode}
              className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold flex items-center gap-2 sm:gap-2.5 shadow-lg transition-all transform active:scale-95 text-sm sm:text-base whitespace-nowrap ${
                isActive
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              {isActive ? (
                <>
                  <Square className="w-5 h-5 fill-current" /> Stop Scanning
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" /> Start Continuous Scan
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl">
          <button
            onClick={() => {
              if (isActive) toggleDriveMode();
              setSourceMode('video');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              sourceMode === 'video'
                ? 'bg-white dark:bg-gray-700 text-govBlue dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            <Film className="w-4 h-4" /> <span className="hidden sm:inline">Upload</span> Video
          </button>
          <button
            onClick={() => {
              if (isActive) toggleDriveMode();
              setSourceMode('camera');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              sourceMode === 'camera'
                ? 'bg-white dark:bg-gray-700 text-govBlue dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            <Video className="w-4 h-4" /> <span className="hidden sm:inline">Live</span> Camera
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Background AI Sampling Active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
        {/* Left column: dashcam viewport, with the capture feed beneath it */}
        <div className="lg:col-span-2 min-w-0 space-y-4">
          {/* LIVE VIDEO VIEWPORT WITH CANVAS OVERLAY */}
          <div ref={videoContainerRef} className="min-w-0 bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl relative aspect-video min-h-[200px] flex items-center justify-center border border-gray-800">
            <video
              ref={videoRef}
              src={sourceMode === 'video' ? videoSrc || undefined : undefined}
              playsInline
              controls={sourceMode === 'video' && !!videoSrc}
              muted
              loop
              className="w-full h-full object-cover max-h-[500px]"
            />

            {/* Canvas overlay for bounding boxes */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              style={{ objectFit: 'cover' }}
            />

            {/* Fallback Screen when Inactive or No Video Selected */}
            {!isActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/85 text-gray-400 p-6 text-center z-20">
                {sourceMode === 'video' ? (
                  <div className="space-y-4 max-w-sm">
                    <FileVideo className="w-16 h-16 text-govBlue mx-auto" />
                    <h3 className="text-lg font-semibold text-gray-200">
                      {videoFile ? videoFile.name : 'No Dashcam Video Selected'}
                    </h3>
                    <p className="text-xs text-gray-400">
                      Select any recorded dashcam video (.mp4, .webm, .mov). The video runs smoothly while AI extracts detections.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleVideoUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 bg-govBlue hover:bg-blue-700 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 shadow"
                    >
                      <UploadCloud className="w-4 h-4" /> Choose Video File
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-w-sm">
                    <Camera className="w-16 h-16 text-gray-600 mx-auto" />
                    <h3 className="text-lg font-semibold text-gray-200">Camera Inactive</h3>
                    <p className="text-xs text-gray-400">
                      Press "Start Continuous Scan" to activate the camera and scan road damage continuously.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Clean HUD Status Bar when Active */}
            {isActive && (
              <div className="absolute top-4 left-4 right-4 pointer-events-none flex justify-between items-center text-xs font-mono z-20">
                <div className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-emerald-400 border border-emerald-500/30 flex items-center gap-2 shadow">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  {detectionMode === 'gemini' ? '✨ GEMINI' : '🧠 YOLO'} · {sourceMode === 'video' ? 'VIDEO FILE' : 'LIVE DASHCAM'}
                </div>
                {isProcessing && (
                  <div className="bg-blue-600/90 backdrop-blur-md px-3 py-1.5 rounded-lg text-white font-bold flex items-center gap-2 shadow">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> SCANNING
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Stream Capture History Feed */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-govBlue" /> Real-Time Defect Stream & Annotations
              </span>
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400 font-mono">
                Showing last {logs.length} captures
              </span>
            </h2>

            {logs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No frames captured yet. Choose a video or camera and click "Start Continuous Scan" to begin.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <AnimatePresence>
                  {logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`p-3 rounded-xl border relative overflow-hidden transition-all ${
                        log.status === 'pothole_found'
                          ? log.isDuplicateMerged
                            ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40'
                            : 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                          : log.status === 'detecting'
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 animate-pulse'
                          : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800'
                      }`}
                    >
                      <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative mb-2 flex items-center justify-center">
                        {log.annotatedImageUrl || log.originalImageUrl ? (
                          <img
                            src={log.annotatedImageUrl || log.originalImageUrl}
                            alt="Capture snapshot"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="w-6 h-6 text-gray-600" />
                        )}

                        {log.potholeCount > 0 && (
                          <span className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white shadow ${
                            log.isDuplicateMerged ? 'bg-blue-600' : 'bg-red-600'
                          }`}>
                            {log.isDuplicateMerged ? `TRACK: ${log.trackId}` : `NEW: ${log.trackId || 'POTHOLE'}`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500 font-mono text-[10px]">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase ${
                            log.status === 'pothole_found'
                              ? log.isDuplicateMerged
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-red-600 dark:text-red-400'
                              : log.status === 'detecting'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {log.status === 'pothole_found'
                            ? log.isDuplicateMerged
                              ? 'Merged Observation'
                              : 'New Pothole'
                            : log.status === 'detecting'
                            ? 'Inferring...'
                            : 'Clean Road'}
                        </span>
                      </div>

                      <p className="text-[10px] font-mono text-gray-600 dark:text-gray-400 truncate flex items-center gap-1">
                        <Navigation className="w-2.5 h-2.5 flex-shrink-0 text-blue-500" />
                        {log.lat ? `${log.lat.toFixed(4)}, ${log.lng.toFixed(4)}` : 'GPS N/A'}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>


        {/* Live Telemetry & Control Panel */}
        <div className="space-y-4">
          {/* Detection Settings (Component B: YOLO/Gemini Switcher) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-govBlue" /> Detection Settings
            </h2>

            {/* AI Model Toggle (Component B) */}
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Detection Engine</p>
              <div className="flex bg-gray-100 dark:bg-gray-900 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setDetectionMode('yolo')}
                  disabled={isActive}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    detectionMode === 'yolo'
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                  }`}
                >
                  <Brain className="w-3.5 h-3.5" /> YOLO v8
                </button>
                <button
                  onClick={() => setDetectionMode('gemini')}
                  disabled={isActive}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    detectionMode === 'gemini'
                      ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Gemini
                </button>
              </div>
            </div>

            {/* Confidence Threshold */}
            {detectionMode === 'yolo' && (
              <div>
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <span>YOLO Confidence Threshold</span>
                  <span className="font-bold text-govBlue font-mono">{(confidenceThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.60"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  10% - 15% is recommended for moving road videos.
                </p>
              </div>
            )}

            {/* Background Sample Rate */}
            <div>
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>Background Sample Rate</span>
                <span className="font-bold text-govBlue font-mono">Every {timeIntervalSeconds}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                disabled={isActive}
                value={timeIntervalSeconds}
                onChange={(e) => setTimeIntervalSeconds(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
            </div>

            {sourceMode === 'video' && videoFile && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  disabled={isActive}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Change Video ({videoFile.name.substring(0, 16)}...)
                </button>
              </div>
            )}
          </div>

          {/* Stats Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-govBlue" /> Session Telemetry
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">Captured Frames</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{capturedFramesCount}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-xl border border-red-100 dark:border-red-900/40">
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold">Unique Defects</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{uniqueDefectsCount}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs text-blue-600 dark:text-blue-400">Deduplicated Merges</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1 font-mono">
                  {deduplicatedSightingsCount}
                </p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Playback Mode</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-2 font-mono">
                  Smooth 1.0x
                </p>
              </div>
            </div>

            {/* Live GPS Lock Indicator */}
            <div className={`mt-2 p-2 rounded-xl border flex items-center gap-2 text-[10px] font-mono ${
              currentPosition
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300'
            }`}>
              <Navigation className="w-3 h-3 flex-shrink-0" />
              {currentPosition
                ? `GPS LOCK · ${currentPosition.coords.latitude.toFixed(5)}, ${currentPosition.coords.longitude.toFixed(5)}`
                : sourceMode === 'video'
                  ? 'VIDEO MODE · Simulated coordinates'
                  : 'GPS ACQUIRING…'
              }
            </div>

            {lastDetectionResult && (
              <div className="mt-2 p-2.5 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-govBlue" />
                <span className="truncate">{lastDetectionResult}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriveMode;
