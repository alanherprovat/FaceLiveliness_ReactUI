import React, { useState, useEffect, useRef } from 'react';

const SimpleFaceVerification = () => {
  const [state, setState] = useState({
    currentStep: 0,
    isConnected: false,
    isComplete: false,
    error: null,
    progress: 0,
    totalTime: 0,
    completionTime: 0,
    yaw: 0,
    faceDetected: true
  });

  const wsRef = useRef(null);
  const completedRef = useRef(false);

  const radius = 170;
  const strokeWidth = 18; // 16–24 works best in most cases

  const circumference = 2 * Math.PI * 170;
  const strokeDashoffset = circumference - (state.progress / 100) * circumference;


  const INSTRUCTIONS = [
    { step: 1, text: 'Blink Your Eyes', hint: 'Close and open both eyes', color: '#667eea' },
    { step: 2, text: 'Blink Again', hint: 'One more time, close and open both eyes', color: '#667eea' },
    { step: 3, text: 'Turn Head Left', hint: 'Turn your head to the left side', color: '#f59e0b' },
    { step: 4, text: 'Turn Head Right', hint: 'Turn your head to the right side', color: '#3b82f6' },
    { step: 5, text: 'Open Your Mouth', hint: 'Open your mouth wide, then close it', color: '#22c55e' }
  ];

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:5000/ws');
    
    ws.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const isComplete = data.state >= 5;
      
      // Capture completion time once
      if (isComplete && !completedRef.current) {
        completedRef.current = true;
        setState(prev => ({
          ...prev,
          currentStep: data.state || 0,
          isComplete: true,
          totalTime: data.total_time || 0,
          completionTime: data.total_time || 0,
          yaw: data.yaw || 0,
          faceDetected: data.face_detected !== false,
          error: data.error || null,
          progress: 100
        }));
      } else if (!isComplete) {
        completedRef.current = false;
        setState(prev => ({
          ...prev,
          currentStep: data.state || 0,
          isComplete: false,
          totalTime: data.total_time || 0,
          yaw: data.yaw || 0,
          faceDetected: data.face_detected !== false,
          error: data.error || null,
          progress: ((data.state || 0) / 5) * 100
        }));
      }
    };

    ws.onerror = () => {
      setState(prev => ({ ...prev, error: 'Connection error. Check if server is running.' }));
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const handleRestart = () => {
    completedRef.current = false;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'restart' }));
    }
    setState(prev => ({
      ...prev,
      currentStep: 0,
      isComplete: false,
      progress: 0,
      completionTime: 0,
      error: null
    }));
  };

  const currentInstruction = INSTRUCTIONS[state.currentStep] || INSTRUCTIONS[0];


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
            {/* Progress Ring */}

<svg
  style={styles.progressRing}
  viewBox="0 0 360 360"
  preserveAspectRatio="xMidYMid slice"
>
  <circle
    cx="180" cy="180" r={radius}
    fill="none"
    stroke="#e5e7eb"
    strokeWidth={strokeWidth}
    vectorEffect="non-scaling-stroke"
  />
  <circle
    cx="180" cy="180" r={radius}
    fill="none"
    stroke={state.isComplete ? '#22c55e' : currentInstruction.color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeDasharray={circumference}
    strokeDashoffset={circumference - (state.progress / 100) * circumference}
    shapeRendering="geometricPrecision"     // ← add this (helps consistency)
    vectorEffect="non-scaling-stroke"
  />
</svg>


            {/* Video Frame */}
            <div style={styles.videoFrame}>
              <img 
                src="http://localhost:5000/video" 
                alt="Camera Feed"
                style={styles.videoStream}
                onError={() => setState(prev => ({ ...prev, error: 'Failed to load video stream' }))}
              />

              {/* Completion Overlay */}
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
              {!state.faceDetected && !state.isComplete && (
                <div style={styles.noFaceOverlay}>
                  <div style={styles.warningIcon}>⚠️</div>
                  <div style={styles.warningText}>No Face Detected</div>
                </div>
              )}
            </div>
          </div>

          {/* Progress Text */}
          <div style={styles.progressText}>
            <span style={{ ...styles.progressBar, color: currentInstruction.color }}>
              {state.isComplete ? 'Complete!' : `Step ${state.currentStep + 1} of 5`}
            </span>
            {' · '}
            <span>{Math.round(state.progress)}% Complete</span>
          </div>

          {/* Instruction Box */}
          <div style={styles.instructionBox}>
            <div style={{ ...styles.stepNumber, background: currentInstruction.color }}>
              {currentInstruction.step}
            </div>
            <div style={styles.instructionText}>{currentInstruction.text}</div>
            <div style={styles.instructionHint}>{currentInstruction.hint}</div>
          </div>
        </div>

        {/* Status Section */}
        <div style={styles.statusSection}>
          {/* Connection Status */}
          <div style={{
            ...styles.connectionStatus,
            ...(state.isConnected ? styles.connected : styles.disconnected)
          }}>
            <div style={{
              ...styles.statusDot,
              background: state.isConnected ? '#22c55e' : '#ef4444'
            }}/>
            <span>{state.isConnected ? 'Connected' : 'Reconnecting...'}</span>
          </div>

          {/* Error Message */}
          {state.error && (
            <div style={styles.errorMessage}>{state.error}</div>
          )}

          {/* Metrics */}
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Time Elapsed</span>
            <span style={styles.statusValue}>
              {state.isComplete ? state.completionTime.toFixed(1) : state.totalTime.toFixed(1)}s
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
    margin: 0
  },
  container: {
    maxWidth: '600px',
    width: '100%',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden'
  },
  header: {
    padding: '24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    textAlign: 'center'
  },
  headerTitle: {
    fontSize: 'clamp(20px, 5vw, 24px)',
    fontWeight: 600,
    marginBottom: '8px'
  },
  headerSubtitle: {
    fontSize: 'clamp(12px, 3vw, 14px)',
    opacity: 0.9
  },
  videoSection: {
    position: 'relative',
    padding: 'clamp(16px, 4vw, 32px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px'
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '360px',
    aspectRatio: '1 / 1'
  },
  // progressRing: {
  //   position: 'absolute',
  //   top: '0',
  //   left: '0',
  //   width: '100%',
  //   height: '100%',
  //   transform: 'rotate(-90deg)',
  //   pointerEvents: 'none'
  // },
  progressRing: {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none'
},

  videoFrame: {
    position: 'relative',
    width: 'calc(100% - 20px)',
    height: 'calc(100% - 20px)',
    borderRadius: '50%',
    overflow: 'hidden',
    margin: '10px',
    border: '3px solid #e5e7eb'
  },
  videoStream: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
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
    borderRadius: '50%'
  },
  checkmark: {
    width: 'clamp(60px, 15vw, 80px)',
    height: 'clamp(60px, 15vw, 80px)',
    borderRadius: '50%',
    background: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'clamp(36px, 10vw, 48px)'
  },
  completionText: {
    color: 'white',
    fontSize: 'clamp(20px, 5vw, 24px)',
    fontWeight: 600
  },
  completionTime: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 'clamp(14px, 3vw, 16px)'
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
    borderRadius: '50%'
  },
  warningIcon: {
    fontSize: 'clamp(36px, 10vw, 48px)'
  },
  warningText: {
    color: 'white',
    fontSize: 'clamp(16px, 4vw, 18px)',
    fontWeight: 600,
    textAlign: 'center',
    padding: '0 20px'
  },
  progressText: {
    textAlign: 'center',
    fontSize: 'clamp(12px, 3vw, 14px)',
    color: '#6b7280',
    marginTop: '-16px'
  },
  progressBar: {
    fontWeight: 600
  },
  instructionBox: {
    width: '100%',
    padding: '20px',
    background: '#f9fafb',
    borderRadius: '12px',
    textAlign: 'center',
    border: '2px solid #e5e7eb'
  },
  stepNumber: {
    display: 'inline-block',
    width: 'clamp(28px, 7vw, 32px)',
    height: 'clamp(28px, 7vw, 32px)',
    borderRadius: '50%',
    color: 'white',
    fontWeight: 600,
    fontSize: 'clamp(14px, 3.5vw, 16px)',
    lineHeight: 'clamp(28px, 7vw, 32px)',
    marginBottom: '12px'
  },
  instructionText: {
    fontSize: 'clamp(18px, 4.5vw, 20px)',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '8px'
  },
  instructionHint: {
    fontSize: 'clamp(12px, 3vw, 14px)',
    color: '#6b7280'
  },
  statusSection: {
    padding: '0 clamp(16px, 4vw, 32px) clamp(16px, 4vw, 32px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: 'clamp(12px, 3vw, 14px)'
  },
  connected: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    color: '#166534'
  },
  disconnected: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#991b1b'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },
  errorMessage: {
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    color: '#991b1b',
    fontSize: 'clamp(12px, 3vw, 14px)',
    lineHeight: 1.5
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#f9fafb',
    borderRadius: '8px',
    fontSize: 'clamp(12px, 3vw, 14px)'
  },
  statusLabel: {
    color: '#6b7280',
    fontWeight: 500
  },
  statusValue: {
    color: '#1f2937',
    fontWeight: 600,
    fontFamily: 'monospace'
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
    touchAction: 'manipulation'
  }
};

export default SimpleFaceVerification;