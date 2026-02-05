import React, { useState, useEffect, useRef } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

const SimpleFaceVerify = () => {
  const [state, setState] = useState({
    currentStep: 0,
    isConnected: false,
    isComplete: false,
    error: null,
    progress: 0,
    faceDetected: true,
    yaw: 0,
  });

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
      setState(prev => ({ 
        ...prev, 
        error: 'Camera access denied. Please allow camera permissions.' 
      }));
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
    }, 100);
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !wsRef.current || 
        wsRef.current.readyState !== WebSocket.OPEN || state.isComplete) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState !== 4 || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const frameData = canvas.toDataURL('image/jpeg', 0.8);
      
      if (!frameData || frameData.length < 100) {
        return;
      }

      wsRef.current.send(JSON.stringify({
        action: 'process_frame',
        frame: frameData
      }));
    } catch (err) {
      console.error('Frame capture error:', err);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
  
    const ws = new WebSocket(wsUrl);
  
    ws.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
      console.log('WebSocket connected');
    };
  
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const isComplete = data.state >= 5;

      if (isComplete && !completedRef.current) {
        completedRef.current = true;
        setState((prev) => ({
          ...prev,
          currentStep: data.state || 0,
          isComplete: true,
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
          yaw: data.yaw || 0,
          faceDetected: data.face_detected !== false,
          error: data.error || null,
          progress: ((data.state || 0) / 5) * 100,
        }));
      }
    };
  
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setState((prev) => ({ ...prev, error: 'Connection error. Check backend.' }));
    };
  
    ws.onclose = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      setTimeout(connectWebSocket, 3000);
    };
  
    wsRef.current = ws;
  };

  const handleRestart = () => {
    completedRef.current = false;
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'restart' }));
    }
    
    setState((prev) => ({
      ...prev,
      currentStep: 0,
      isComplete: false,
      progress: 0,
      error: null,
    }));
  };

  const currentInstruction = INSTRUCTIONS[state.currentStep] || INSTRUCTIONS[0];
  const progressColor = state.isComplete ? '#22c55e' : currentInstruction.color;

  return (
    <div style={styles.container}>
      {/* Circular Frame with Progress */}
      <div style={styles.frameWrapper}>
        {/* Progress Ring */}
        <div style={styles.progressRing}>
          <CircularProgressbar
            value={state.progress}
            strokeWidth={2}
            styles={buildStyles({
              pathColor: progressColor,
              trailColor: '#e5e7eb',
              strokeLinecap: 'round',
              pathTransitionDuration: 0.5,
            })}
          />
        </div>

        {/* Video Circle */}
        <div style={styles.videoCircle}>
          {/* Hidden canvas for frame processing */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          {/* Live video feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={styles.video}
          />

          {/* Completion Overlay */}
          {state.isComplete && (
            <div style={styles.overlay}>
              <div style={styles.checkmark}>✓</div>
              <div style={styles.overlayText}>Verified!</div>
            </div>
          )}

          {/* No Face Warning */}
          {!state.isComplete && !state.faceDetected && cameraReady && (
            <div style={styles.warningOverlay}>
              <div style={styles.warningIcon}>⚠️</div>
              <div style={styles.overlayText}>No Face Detected</div>
            </div>
          )}

          {/* Error Overlay */}
          {/* {state.error && (
            <div style={styles.errorOverlay}>
              <div style={styles.warningIcon}>📷</div>
              <div style={styles.overlayText}>{state.error}</div>
            </div>
          )} */}
        </div>
      </div>

      {/* Instruction Box */}
      <div style={styles.instructionBox}>
        <div style={styles.instructionRow}>
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

      {/* Status Badge */}
      <div style={styles.statusBadge}>
        <div 
          style={{
            ...styles.statusDot,
            background: state.isConnected && cameraReady ? '#22c55e' : '#ef4444'
          }} 
        />
        <span style={styles.statusText}>
          {!cameraReady ? 'Initializing...' : 
           !state.isConnected ? 'Connecting...' : 
           state.isComplete ? 'Complete' :
           `Step ${state.currentStep + 1}/5 · ${Math.round(state.progress)}%`}
        </span>
      </div>

      {/* Restart Button */}
      {state.isComplete && (
        <button onClick={handleRestart} style={styles.restartBtn}>
          Restart
        </button>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
  },
  frameWrapper: {
    position: 'relative',
    width: '320px',
    height: '320px',
  },
  progressRing: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  videoCircle: {
    position: 'relative',
    width: 'calc(100% - 20px)',
    height: 'calc(100% - 20px)',
    margin: '10px',
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(34, 197, 94, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  warningOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(239, 68, 68, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  checkmark: {
    width: '70px',
    height: '70px',
    borderRadius: '50%',
    background: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '42px',
    color: '#22c55e',
  },
  warningIcon: {
    fontSize: '48px',
  },
  overlayText: {
    color: 'white',
    fontSize: '20px',
    fontWeight: 600,
    textAlign: 'center',
    padding: '0 20px',
  },
  instructionBox: {
    width: '100%',
    maxWidth: '320px',
    padding: '20px 16px',
    background: '#f9fafb',
    borderRadius: '12px',
    border: '2px solid #e5e7eb',
    textAlign: 'center',
  },
  instructionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '10px',
  },
  stepNumber: {
    flexShrink: 0,
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    color: 'white',
    fontWeight: 700,
    fontSize: '20px',
    lineHeight: '44px',
    textAlign: 'center',
  },
  instructionText: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#1f2937',
  },
  instructionHint: {
    fontSize: '15px',
    color: '#6b7280',
    lineHeight: 1.4,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#f9fafb',
    borderRadius: '20px',
    border: '1px solid #e5e7eb',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  },
  restartBtn: {
    padding: '12px 32px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};

export default SimpleFaceVerify;