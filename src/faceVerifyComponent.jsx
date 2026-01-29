import React, { useState, useEffect, useRef } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

const FaceVerification = () => {
  const [state, setState] = useState({
    currentStep: 0,
    isConnected: false,
    isComplete: false,
    error: null,
    progress: 0,
    totalTime: 0,
    completionTime: 0,
    yaw: 0,
    faceDetected: true,
  });

  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

  const wsRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const completedRef = useRef(false);
  const frameIntervalRef = useRef(null);

  const INSTRUCTIONS = [
    { step: 1, text: 'Blink Your Eyes', hint: 'Close and open both eyes', color: '#667eea' },
    { step: 2, text: 'Blink Again', hint: 'One more time, close and open both eyes', color: '#667eea' },
    { step: 3, text: 'Turn Head Left', hint: 'Turn your head to the left side', color: '#f59e0b' },
    { step: 4, text: 'Turn Head Right', hint: 'Turn your head to the right side', color: '#3b82f6' },
    { step: 5, text: 'Open Your Mouth', hint: 'Open your mouth wide, then close it', color: '#22c55e' },
  ];

  // Initialize camera
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Initialize WebSocket
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
          startFrameCapture();
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError('Camera access denied. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
  };

  const startFrameCapture = () => {
    // Send frames to server at ~10 FPS
    frameIntervalRef.current = setInterval(() => {
      captureAndSendFrame();
    }, 100); // 100ms = 10 FPS
  };

  const captureAndSendFrame = () => {
    // Don't send frames if complete, but keep capturing for display
    if (!videoRef.current || !canvasRef.current || !wsRef.current || 
        wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Skip sending to server if verification is complete
    if (state.isComplete) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Check if video is ready
    if (video.readyState !== 4 || video.videoWidth === 0 || video.videoHeight === 0) {
      return; // Video not ready yet
    }

    const context = canvas.getContext('2d');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Convert to base64
      const frameData = canvas.toDataURL('image/jpeg', 0.8);
      
      // Validate frame data
      if (!frameData || frameData.length < 100) {
        return; // Invalid frame
      }

      // Send to server
      wsRef.current.send(JSON.stringify({
        action: 'process_frame',
        frame: frameData
      }));
    } catch (err) {
      console.error('Frame capture error:', err);
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:5000/ws');

    ws.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const isComplete = data.state >= 5;

      if (isComplete && !completedRef.current) {
        completedRef.current = true;
        // Don't stop frame capture - keep camera running for restart
        setState((prev) => ({
          ...prev,
          currentStep: data.state || 0,
          isComplete: true,
          totalTime: data.total_time || 0,
          completionTime: data.total_time || 0,
          yaw: data.yaw || 0,
          faceDetected: data.face_detected !== false,
          error: data.error || null,
          progress: 100,
        }));
      } else if (!isComplete) {
        completedRef.current = false;
        setState((prev) => ({
          ...prev,
          currentStep: data.state || 0,
          isComplete: false,
          totalTime: data.total_time || 0,
          yaw: data.yaw || 0,
          faceDetected: data.face_detected !== false,
          error: data.error || null,
          progress: ((data.state || 0) / 5) * 100,
        }));
      }
    };

    ws.onerror = () => {
      setState((prev) => ({ ...prev, error: 'Connection error. Check if server is running.' }));
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const handleRestart = () => {
    completedRef.current = false;
    
    // Send restart command
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'restart' }));
    }
    
    // Update state - frame capture is already running, it will resume sending
    setState((prev) => ({
      ...prev,
      currentStep: 0,
      isComplete: false,
      progress: 0,
      completionTime: 0,
      error: null,
    }));
  };

  const currentInstruction = INSTRUCTIONS[state.currentStep] || INSTRUCTIONS[0];
  const progressColor = state.isComplete ? '#22c55e' : currentInstruction.color;

  return (
    <div style={styles.body}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>Face Verification</h1>
          <p style={styles.headerSubtitle}>Follow the instructions to complete verification</p>
        </div>

        {/* Video Section */}
        <div style={styles.videoSection}>
          <div style={styles.videoWrapper}>
            {/* Circular Progress Bar */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            >
              <CircularProgressbar
                value={state.progress}
                strokeWidth={2}
                styles={buildStyles({
                  pathColor: progressColor,
                  trailColor: '#e5e7eb',
                  strokeLinecap: 'round',
                  pathTransitionDuration: 0.5,
                  rotation: 0,
                })}
              />
            </div>

            {/* Video Frame */}
            <div style={styles.videoFrame}>
              {/* Camera Feed - Hidden canvas for processing */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              {/* Actual Video Display - Always show, overlay will cover when complete */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={styles.videoStream}
              />

              {/* Camera Error Overlay */}
              {cameraError && (
                <div style={styles.errorOverlay}>
                  <div style={styles.warningIcon}>📷</div>
                  <div style={styles.warningText}>{cameraError}</div>
                  <button onClick={startCamera} style={styles.retryBtn}>
                    Retry Camera Access
                  </button>
                </div>
              )}

              {/* Completion Overlay - Covers video but video still runs underneath */}
              {state.isComplete && (
                <div style={styles.completionOverlay}>
                  <div style={styles.checkmark}>✓</div>
                  <div style={styles.completionText}>Verified!</div>
                  <div style={styles.completionTime}>
                    Completed in {state.completionTime.toFixed(1)}s
                  </div>
                </div>
              )}

              {/* No Face Overlay */}
              {!state.isComplete && !state.faceDetected && cameraReady && (
                <div style={styles.noFaceOverlay}>
                  <div style={styles.warningIcon}>⚠️</div>
                  <div style={styles.warningText}>No Face Detected</div>
                </div>
              )}
            </div>
          </div>

          {/* Progress Text */}
          <div style={styles.progressText}>
            <span style={{ ...styles.progressBar, color: progressColor }}>
              {state.isComplete ? 'Complete!' : `Step ${state.currentStep + 1} of 5`}
            </span>
            {' · '}
            <span>{Math.round(state.progress)}% Complete</span>
          </div>

          {/* Instruction Box */}
          <div style={styles.instructionBox}>
            <div style={styles.instructionRowCentered}>
              <div style={{ ...styles.stepNumber, background: currentInstruction.color }}>
                {currentInstruction.step}
              </div>
              <div style={styles.instructionText}>
                {currentInstruction.text}
              </div>
            </div>
            <div style={styles.instructionHint}>
              {currentInstruction.hint}
            </div>
          </div>
        </div>

        {/* Status Section */}
        <div style={styles.statusSection}>
          {/* Connection Status */}
          <div
            style={{
              ...styles.connectionStatus,
              ...(state.isConnected && cameraReady ? styles.connected : styles.disconnected),
            }}
          >
            <div
              style={{
                ...styles.statusDot,
                background: state.isConnected && cameraReady ? '#22c55e' : '#ef4444',
              }}
            />
            <span>
              {!cameraReady ? 'Initializing camera...' : 
               !state.isConnected ? 'Reconnecting to server...' : 
               'Connected'}
            </span>
          </div>

          {/* Error Message */}
          {state.error && <div style={styles.errorMessage}>{state.error}</div>}

          {/* Metrics */}
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Time Elapsed</span>
            <span style={styles.statusValue}>
              {state.isComplete
                ? state.completionTime.toFixed(1)
                : state.totalTime.toFixed(1)}
              s
            </span>
          </div>

          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Head Position</span>
            <span style={styles.statusValue}>{state.yaw.toFixed(0)}°</span>
          </div>

          {/* Restart Button */}
          <button onClick={handleRestart} style={styles.restartBtn}>
            Restart Verification
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  body: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    margin: 0,
  },
  container: {
    maxWidth: '600px',
    width: '100%',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  header: {
    padding: '24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 'clamp(20px, 5vw, 24px)',
    fontWeight: 600,
    marginBottom: '8px',
  },
  headerSubtitle: {
    fontSize: 'clamp(12px, 3vw, 14px)',
    opacity: 0.9,
  },
  videoSection: {
    position: 'relative',
    padding: 'clamp(16px, 4vw, 32px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '360px',
    aspectRatio: '1 / 1',
  },
  videoFrame: {
    position: 'relative',
    width: 'calc(100% - 20px)',
    height: 'calc(100% - 20px)',
    borderRadius: '50%',
    overflow: 'hidden',
    margin: '10px',
    background: '#000',
  },
  videoStream: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)', // Mirror the video
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(239, 68, 68, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '16px',
    borderRadius: '50%',
    zIndex: 3,
  },
  completionOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(34, 197, 94, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '16px',
    borderRadius: '50%',
    zIndex: 3,
  },
  checkmark: {
    width: 'clamp(60px, 15vw, 80px)',
    height: 'clamp(60px, 15vw, 80px)',
    borderRadius: '50%',
    background: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'clamp(36px, 10vw, 48px)',
  },
  completionText: {
    color: 'white',
    fontSize: 'clamp(20px, 5vw, 24px)',
    fontWeight: 600,
  },
  completionTime: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 'clamp(14px, 3vw, 16px)',
  },
  noFaceOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '12px',
    borderRadius: '50%',
    zIndex: 3,
  },
  warningIcon: {
    fontSize: 'clamp(36px, 10vw, 48px)',
  },
  warningText: {
    color: 'white',
    fontSize: 'clamp(16px, 4vw, 18px)',
    fontWeight: 600,
    textAlign: 'center',
    padding: '0 20px',
  },
  retryBtn: {
    padding: '12px 24px',
    background: 'white',
    color: '#ef4444',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
  },
  progressText: {
    textAlign: 'center',
    fontSize: 'clamp(12px, 3vw, 14px)',
    color: '#6b7280',
    marginTop: '-16px',
  },
  progressBar: {
    fontWeight: 600,
  },
  instructionBox: {
    width: '90%',
    padding: '20px 16px',
    background: '#f9fafb',
    borderRadius: '12px',
    border: '2px solid #e5e7eb',
    textAlign: 'center',
  },
  instructionRowCentered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px 16px',
    flexWrap: 'wrap',
    marginBottom: '10px',
  },
  stepNumber: {
    flexShrink: 0,
    width: 'clamp(36px, 9vw, 44px)',
    height: 'clamp(36px, 9vw, 44px)',
    borderRadius: '50%',
    color: 'white',
    fontWeight: 700,
    fontSize: 'clamp(16px, 4.2vw, 20px)',
    lineHeight: 'clamp(36px, 9vw, 44px)',
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 'clamp(17px, 4.5vw, 20px)',
    fontWeight: 600,
    color: '#1f2937',
    lineHeight: 1.35,
  },
  instructionHint: {
    fontSize: 'clamp(13px, 3.4vw, 15px)',
    color: '#6b7280',
    lineHeight: 1.4,
    maxWidth: '90%',
    margin: '0 auto',
  },
  statusSection: {
    padding: '0 clamp(16px, 4vw, 32px) clamp(16px, 4vw, 32px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: 'clamp(12px, 3vw, 14px)',
  },
  connected: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    color: '#166534',
  },
  disconnected: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#991b1b',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  errorMessage: {
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    color: '#991b1b',
    fontSize: 'clamp(12px, 3vw, 14px)',
    lineHeight: 1.5,
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#f9fafb',
    borderRadius: '8px',
    fontSize: 'clamp(12px, 3vw, 14px)',
  },
  statusLabel: {
    color: '#6b7280',
    fontWeight: 500,
  },
  statusValue: {
    color: '#1f2937',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  restartBtn: {
    width: '100%',
    padding: 'clamp(12px, 3vw, 14px)',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: 'clamp(14px, 3.5vw, 16px)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
    touchAction: 'manipulation',
  },
};

export default FaceVerification;