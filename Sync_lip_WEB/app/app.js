import React, { useRef, useState, useEffect } from 'react';

/**
 * Small animated spinner icon
 */
function Spinner() {
  return <div className="spinner" />;
}

/**
 * ImageUploader shows a file‐input and a thumbnail preview once loaded.
 */
// function ImageUploader({ onChange }) {
//   return (
//     <input
//       type="file"
//       accept="image/*"
//       onChange={(e) => onChange(e.target.files[0])}
//     />
//   );
// }
function ImageUploader({ onChange, disabled }) {
  const [previewSrc, setPreviewSrc] = useState(null);

  const handleFile = (file) => {
    onChange(file);
    if (!file) {
      setPreviewSrc(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewSrc(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="uploader">
      <label className="uploader-label">
        {previewSrc ? (
          <img src={previewSrc} alt="Selected" className="preview-img" />
        ) : (
          <div className="placeholder-img">No Image Selected</div>
        )}
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={(e) => handleFile(e.target.files[0])}
          className="file-input"
        />
      </label>
    </div>
  );
}

// function AudioUploader({ onChange }) {
//   return (
//     <input
//       type="file"
//       accept="audio/*"
//       onChange={(e) => onChange(e.target.files[0])}
//     />
//   );
// }

/**
 * AudioUploader simply shows the file‐input and displays the filename.
 */
function AudioUploader({ onChange, disabled, selectedAudioName }) {
  return (
    <div className="uploader audio-uploader">
      <label className="uploader-label">
        <div className="audio-placeholder">
          {selectedAudioName || 'No Audio Selected'}
        </div>
        <input
          type="file"
          accept="audio/*"
          disabled={disabled}
          onChange={(e) => onChange(e.target.files[0])}
          className="file-input"
        />
      </label>
    </div>
  );
}

/**
 * ProgressBar shows a styled progress bar with time labels.
 */
function ProgressBar({ progress, duration }) {
  const playedSeconds = Math.round(progress * duration);
  return (
    <div className="progress-container">
      <div className="progress-labels">
        <span>{playedSeconds}s</span>
        <span>{duration}s</span>
      </div>
      <div className="progress-bar-outer">
        <div
          className="progress-bar-inner"
          style={{ width: `${Math.min(Math.max(progress * 100, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function MainApp() {
  const [image, setImage] = useState(null);
  const [audio, setAudio] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0); // 0 to 1
  const [audioDuration, setAudioDuration] = useState(0); // in seconds
  const [statusMessage, setStatusMessage] = useState(''); // To show feedback
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connecting' | 'streaming'

 // ── Refs ────────────────────────────────────────────────────────────────
  const frameBuffer = useRef([]);      // holds base64‐frames until we draw them
  const wsRef = useRef(null);          // the WebSocket instance
  const canvasRef = useRef(null);      // the <canvas> DOM node
  const playbackTimer = useRef(null);  // for setTimeout/clearTimeout of frames
// ── Audio Playback Refs ─────────────────────────────────────────────────
  const audioCtxRef = useRef(null);        // AudioContext
  const processorRef = useRef(null);       // ScriptProcessorNode
  const audioQueueRef = useRef([]);        // Float32 samples pending playback
  const audioSampleRate = 16000;        // we expect 16 kHz mono from server

 // ── Audio Playback (HTMLAudioElement) ─────────────────────────────────────
  const audioRef = useRef(null);
  const inactivityTimeoutRef = useRef(null);
  const AUDIO_PAUSE_DELAY = 500; // milliseconds to wait without new frame before pausing

  
  /**
     * Initialize the AudioContext + a ScriptProcessorNode that will pull
     * from audioQueueRef and write to the AudioDestination (speakers).
     */
    const setupAudioPlayback = () => {
      if (audioCtxRef.current) return; // already initialized

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: audioSampleRate });
      audioCtxRef.current = audioCtx;

      // We'll use a small buffer size—e.g. 4096 samples. 
      // (You can experiment with 2048 or 8192 if you like.)
      const bufferSize = 4096; 
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const outputBuffer = event.outputBuffer.getChannelData(0);
        const queue = audioQueueRef.current;

        // Fill the outputBuffer from the queue; if not enough data, pad with zero.
        for (let i = 0; i < outputBuffer.length; i++) {
          if (queue.length > 0) {
            outputBuffer[i] = queue.shift();
          } else {
            outputBuffer[i] = 0;
          }
        }
      };

      // Connect the processor to the destination
      processor.connect(audioCtx.destination);
    };

/**
   * Called whenever we receive a base64‐encoded Int16PCM chunk over WebSocket.
   * We decode it to Float32 [-1..1], and push all samples onto audioQueueRef.current.
   */
  // const handleIncomingAudioChunk = (b64string) => {
  //   // 1) Base64 → Uint8Array (raw bytes)
  //   const raw = atob(b64string);
  //   const len = raw.length;
  //   const bytes = new Uint8Array(len);
  //   for (let i = 0; i < len; i++) {
  //     bytes[i] = raw.charCodeAt(i);
  //   }

  //   // 2) Interpret as Int16Array
  //   const int16 = new Int16Array(bytes.buffer);

  //   // 3) Convert each Int16 sample → Float32 in [-1,1], push onto queue
  //   const floatSamples = new Float32Array(int16.length);
  //   for (let i = 0; i < int16.length; i++) {
  //     floatSamples[i] = int16[i] / 32768; 
  //     // clamp if you want: e.g. floatSamples[i] = Math.max(-1, Math.min(1, int16[i] / 32768));
  //   }

  //   // 4) Push all floatSamples onto our queue
  //   const queue = audioQueueRef.current;
  //   for (let i = 0; i < floatSamples.length; i++) {
  //     queue.push(floatSamples[i]);
  //   }
  // };

  // Draw a frame to canvas
  const drawFrame = (b64) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  };

  // Playback loop: draw frames from buffer at fixed FPS
  const startPlayback = (fps = 25) => {
    if (playbackTimer.current) {
      clearTimeout(playbackTimer.current);
    }
    const next = () => {
      if (frameBuffer.current.length > 0) {
        const b64 = frameBuffer.current.shift();
        if (b64) {
          drawFrame(b64);
        }
      }
      playbackTimer.current = setTimeout(next, 1000 / fps);
    };
    next();
  };


  const handleSubmit = async () => {
    if (!image || !audio) {
      setStatusMessage('Please select both image and audio before submitting.');
      return;
    }
    setPlaying(true);
    setStatusMessage('Uploading image...');
    setStatusMessage('🔄 Uploading & initializing…');
    setConnectionStatus('connecting');
    // 1. Upload image
    const formData = new FormData();
    formData.append('image', image);
    formData.append('audio', audio)

    const response = await fetch('http://localhost:8000/upload_image', {
      method: 'POST',
      body: formData,
    });

    const jsonData = await response.json();
    const sessionId = jsonData.session_id;

    // 2. Open WebSocket (note: add session_id if needed)
    setStatusMessage('🔗 Connecting WebSocket…');
    wsRef.current = new WebSocket(`ws://localhost:8000/ws/lipsync/${sessionId}`);
    
    // When WebSocket opens, set up audio playback + start streaming
    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({"request": "sync-lip"}))
      setConnectionStatus('streaming');
      setStatusMessage('▶️ Streaming audio & frames…');

      // 1) Initialize the AudioContext + ScriptProcessorNode
      setupAudioPlayback();

      // Create an HTMLAudioElement from the uploaded file object
      audioRef.current = new Audio(URL.createObjectURL(audio));
      audioRef.current.loop = false;
      audioRef.current.preload = 'auto';

      // 2) Start the frame‐drawing loop
      startPlayback(25);
    };

    wsRef.current.onmessage = (event) => {
      try {
          const data = JSON.parse(event.data);
          if (data.sync_lip_done){
            setPlaying(false);
            setStatusMessage('Done')
          }
          if (data.frame) {
            // Push frame into the buffer
            console.log(data.frame)
            frameBuffer.current.push(data.frame);
            if (audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch((e) => {
                console.warn('Audio playback failed:', e);
              });
            }
            // // 3) Reset inactivity timeout so we can pause if no new frame arrives
            // if (inactivityTimeoutRef.current) {
            //   clearTimeout(inactivityTimeoutRef.current);
            // }
            // inactivityTimeoutRef.current = setTimeout(() => {
            //   if (audioRef.current && !audioRef.current.paused) {
            //     audioRef.current.pause();
            //   }
            // }, AUDIO_PAUSE_DELAY);
          }
        } catch (e) {
          console.warn('Invalid JSON from server:', event.data);
        }
    };
    wsRef.current.onclose = () => {
        setConnectionStatus('idle');
        setPlaying(false);
        setStatusMessage('✅ Done.');
      };
    wsRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatusMessage('❌ Connection error.');
      setConnectionStatus('idle');
      setPlaying(false);
      wsRef.current.close();
    };
    // 3. Start playback loop
    // startPlayback(25); // 25 FPS

    // // 4. Play and stream audio
    // playAndStreamAudio(audio);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (playbackTimer.current) clearTimeout(playbackTimer.current);

      // Disconnect audio nodes if they exist
      if (processorRef.current) processorRef.current.disconnect();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  return (
     <div className="ls-container">
      <header className="ls-header">
        <h1 className="ls-title">Real‐Time Audio Lip‐Sync</h1>
        <p className="ls-subtitle">
          Upload a photo and audio, and watch the person “speak” in real time.
        </p>
      </header>

      <main className="ls-main">
        {/* ─── Upload Section ────────────────────────────── */}
        <section className="ls-upload-section">
          <ImageUploader onChange={setImage} disabled={playing} />
          <AudioUploader
            onChange={(f) => {
              setAudio(f);
              setAudioName(f ? f.name : '');
            }}
            disabled={playing}
            selectedAudioName={audioName}
          />

          <button
            className="ls-button"
            onClick={handleSubmit}
            disabled={playing}
          >
            {playing ? (
              <>
                <Spinner /> Processing…
              </>
            ) : (
              'Start Lip‐Sync'
            )}
          </button>

          {statusMessage && (
            <div className="status-container">
              {connectionStatus === 'connecting' && <Spinner />}
              <span className="status-text">{statusMessage}</span>
            </div>
          )}
        </section>

        {/* ─── Progress Bar Section ─────────────────────── */}
        {audioDuration > 0 && (
          <section className="ls-progress-section">
            <ProgressBar progress={audioProgress} duration={audioDuration} />
          </section>
        )}

        {/* ─── Canvas Section ───────────────────────────── */}
        <section className="ls-canvas-section">
          <div className="canvas-wrapper">
            <canvas
              ref={canvasRef}
              width={256}
              height={256}
              className="ls-canvas"
            />
          </div>
        </section>
      </main>

      <footer className="ls-footer">
        <small>© 2025 Lip‐Sync Demo Inc.</small>
      </footer>
    </div>

  );
}
