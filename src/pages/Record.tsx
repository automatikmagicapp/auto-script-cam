import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Circle, Square, Pause, Play, Loader2, Mic, Gauge, Settings2, Upload, RotateCcw, Check, Minus, Plus, Music, Volume2, VolumeX, SkipBack, SkipForward, Download, ZoomIn, ZoomOut, SwitchCamera, Smartphone, Lock } from "lucide-react";
import { toast } from "sonner";

type Phase = "setup" | "countdown" | "recording" | "review";
type Mode = "manual" | "voice";
type Orientation = "portrait" | "landscape";
type Facing = "user" | "environment";

interface UserSettings {
  font_size: number;
  text_color: string;
  bg_color: string;
  bg_opacity: number;
  reading_width: number;
  wpm: number;
  default_mode: string;
  mirror: boolean;
  countdown_seconds: number;
}

interface ScriptMusic {
  music_path: string | null;
  music_filename: string | null;
  music_autoplay: boolean;
  music_volume: number;
  music_loop: boolean;
  music_start_seconds: number;
  music_ducking: boolean;
  music_fade_in: number;
  music_fade_out: number;
}

const Record = () => {
  const { scriptId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<Mode>("manual");
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptContent, setScriptContent] = useState("");
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Live config
  const [wpm, setWpm] = useState(140);
  const [fontSize, setFontSize] = useState(42);
  const [bgOpacity, setBgOpacity] = useState(0.45);
  const [showPanel, setShowPanel] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Refs to keep latest values inside the rAF loop (avoids stale closure)
  const wpmRef = useRef(140);
  const fontSizeRef = useRef(42);
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  // Recording
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  // Camera zoom (native via MediaTrack constraints when supported, CSS fallback otherwise)
  const [zoom, setZoom] = useState<number>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("teleprompter:lastZoom") : null;
    const n = saved ? parseFloat(saved) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number; native: boolean }>({
    min: 0.6,
    max: 3,
    step: 0.1,
    native: false,
  });
  const [showZoom, setShowZoom] = useState(false);

  // ===== Stories 9:16 stage + camera facing + canvas composition =====
  const [orientation, setOrientation] = useState<Orientation>(() =>
    typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches
      ? "landscape"
      : "portrait",
  );
  // When recording starts we lock the orientation chosen at that moment.
  const [lockedOrientation, setLockedOrientation] = useState<Orientation | null>(null);
  const activeOrientation: Orientation = lockedOrientation ?? orientation;

  const [facing, setFacing] = useState<Facing>(() => {
    if (typeof window === "undefined") return "user";
    const saved = window.localStorage.getItem("teleprompter:lastFacing");
    return saved === "environment" ? "environment" : "user";
  });
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);

  // Canvas composition for true 9:16 / 16:9 output
  const stageRef = useRef<HTMLDivElement>(null);
  const compositionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositionRafRef = useRef<number | null>(null);
  const compositionStreamRef = useRef<MediaStream | null>(null);

  // Teleprompter scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  // Voice mode
  const recognitionRef = useRef<any>(null);
  const wordsRef = useRef<string[]>([]);
  const wordIndexRef = useRef(0);
  // Live "ritmo" adjustment for voice mode: extra px/s drift on top of speech sync.
  // Range -1..+1 (negative = slower/rewind drift, positive = faster/forward drift).
  const [voiceBoost, setVoiceBoost] = useState(0);
  const voiceBoostRef = useRef(0);
  useEffect(() => { voiceBoostRef.current = voiceBoost; }, [voiceBoost]);

  // ========== Background music ==========
  const [music, setMusic] = useState<ScriptMusic | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const targetVolRef = useRef(0.6);
  const lastSpeechRef = useRef(0);
  const duckingActiveRef = useRef(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTime, setMusicTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.6);
  const [musicMuted, setMusicMuted] = useState(false);

  // Load script + settings
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [s, st] = await Promise.all([
        scriptId ? supabase.from("scripts").select("*").eq("id", scriptId).single() : Promise.resolve({ data: null, error: null }),
        supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      ]);
      if (s.data) {
        setScriptTitle(s.data.title);
        setScriptContent(s.data.content);
        setReviewTitle(s.data.title);
        if (s.data.music_path) {
          const m: ScriptMusic = {
            music_path: s.data.music_path,
            music_filename: s.data.music_filename,
            music_autoplay: s.data.music_autoplay,
            music_volume: Number(s.data.music_volume),
            music_loop: s.data.music_loop,
            music_start_seconds: s.data.music_start_seconds,
            music_ducking: s.data.music_ducking,
            music_fade_in: s.data.music_fade_in,
            music_fade_out: s.data.music_fade_out,
          };
          setMusic(m);
          setMusicVolume(m.music_volume);
          targetVolRef.current = m.music_volume;
          const { data: signed } = await supabase.storage
            .from("script-music")
            .createSignedUrl(m.music_path!, 3600);
          if (signed?.signedUrl) setMusicUrl(signed.signedUrl);
        }
      }
      if (st.data) {
        setSettings(st.data as UserSettings);
        setWpm(st.data.wpm);
        setFontSize(st.data.font_size);
        setBgOpacity(Number(st.data.bg_opacity));
        setMode((st.data.default_mode as Mode) || "manual");
      }
    })();
  }, [user, scriptId]);

  // Camera setup
  const initCamera = useCallback(async (preferredFacing?: Facing) => {
    try {
      const useFacing = preferredFacing ?? facing;
      // Stop any existing stream first to release the device cleanly.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Ask the browser for a stream that already matches the current stage
      // orientation. This is critical on mobile: if we ask for 1920x1080 while
      // the phone is in portrait, the browser returns a horizontal frame and
      // our 9:16 canvas crops the sides — producing a tight, distorted close-up
      // and losing the surrounding environment. Matching the aspect lets the
      // sensor open in portrait mode (e.g. 1080x1920) and use the full frame,
      // matching the native camera app's framing.
      const ori: Orientation = lockedOrientation ?? orientation;
      const wantW = ori === "portrait" ? 1080 : 1920;
      const wantH = ori === "portrait" ? 1920 : 1080;
      const wantAspect = ori === "portrait" ? 9 / 16 : 16 / 9;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: useFacing },
          width: { ideal: wantW },
          height: { ideal: wantH },
          aspectRatio: { ideal: wantAspect },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Detect zoom capabilities on the video track
      const videoTrack = stream.getVideoTracks()[0] ?? null;
      videoTrackRef.current = videoTrack;
      if (videoTrack && typeof (videoTrack as any).getCapabilities === "function") {
        const caps: any = (videoTrack as any).getCapabilities();
        if (caps && typeof caps.zoom === "object" && caps.zoom !== null) {
          const min = Number(caps.zoom.min ?? 1);
          const max = Number(caps.zoom.max ?? 3);
          const step = Number(caps.zoom.step ?? 0.1) || 0.1;
          setZoomRange({ min, max, step, native: true });
          // Start at min (widest angle) for the most environment in frame
          try {
            await (videoTrack as any).applyConstraints({ advanced: [{ zoom: min }] });
            setZoom(min);
          } catch {}
        } else {
          setZoomRange({ min: 0.6, max: 3, step: 0.1, native: false });
        }
      }

      // Detect if there's more than one camera (front + back)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(cams.length > 1);
      } catch {}
    } catch (err) {
      toast.error("Não foi possível acessar a câmera/microfone");
      console.error(err);
    }
  }, [facing, lockedOrientation, orientation]);

  useEffect(() => {
    initCamera(facing);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recognitionRef.current?.stop?.();
      try { audioCtxRef.current?.close(); } catch {}
      if (compositionRafRef.current) cancelAnimationFrame(compositionRafRef.current);
      compositionStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-open the camera when the user rotates the device (only while not
  // recording). This way the preview always reflects the framing that will
  // actually be recorded — wide and natural in portrait, full frame in
  // landscape — instead of being a sideways crop of a horizontal stream.
  useEffect(() => {
    if (phase === "recording" || phase === "countdown") return;
    // Skip the very first mount (initCamera already ran in the mount effect).
    const t = setTimeout(() => { initCamera(facing); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]);

  // Track viewport orientation (only updates `orientation` when not locked).
  useEffect(() => {
    const update = () => {
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      setOrientation(isLandscape ? "landscape" : "portrait");
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Switch between front (user) and back (environment) camera.
  const switchCamera = async () => {
    if (switchingCamera) return;
    setSwitchingCamera(true);
    const next: Facing = facing === "user" ? "environment" : "user";
    const wasRecording = phase === "recording" && recorderRef.current && !isPaused;
    try {
      // If actively recording, pause first to keep the file consistent.
      if (wasRecording) {
        try { recorderRef.current?.pause(); } catch {}
      }
      await initCamera(next);
      setFacing(next);
      window.localStorage.setItem("teleprompter:lastFacing", next);
      // Reset zoom to widest of the new camera
      setZoom(zoomRange.native ? zoomRange.min : 1);
      if (wasRecording) {
        try { recorderRef.current?.resume(); } catch {}
      }
      toast.success(next === "user" ? "Câmera frontal" : "Câmera traseira");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível trocar de câmera");
    } finally {
      setSwitchingCamera(false);
    }
  };

  // Apply zoom (native track constraint when available; CSS fallback otherwise)
  useEffect(() => {
    window.localStorage.setItem("teleprompter:lastZoom", String(zoom));
    if (zoomRange.native && videoTrackRef.current) {
      try {
        (videoTrackRef.current as any).applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
      } catch {}
    }
  }, [zoom, zoomRange.native]);

  // Manual scroll loop (px per second based on current WPM and font size).
  // Reads from refs so slider changes apply live during recording.
  const startManualScroll = () => {
    lastTsRef.current = 0;
    const tick = (ts: number) => {
      if (!scrollRef.current) return;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      // Direct, responsive formula: doubling wpm doubles real on-screen speed.
      const pxPerSec = (wpmRef.current / 60) * (fontSizeRef.current * 0.18);
      scrollPosRef.current += pxPerSec * dt;
      scrollRef.current.scrollTop = scrollPosRef.current;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Persist wpm preference (debounced) when user changes it
  const wpmSaveTimer = useRef<number | null>(null);
  const persistWpm = (value: number) => {
    if (!user) return;
    if (wpmSaveTimer.current) window.clearTimeout(wpmSaveTimer.current);
    wpmSaveTimer.current = window.setTimeout(() => {
      supabase.from("user_settings").update({ wpm: value }).eq("user_id", user.id);
    }, 600);
  };
  const updateWpm = (value: number) => {
    const v = Math.max(60, Math.min(500, value));
    setWpm(v);
    persistWpm(v);
  };

  // Voice recognition mode
  const startVoiceMode = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Reconhecimento de voz não suportado neste dispositivo. Usando modo manual.");
      startManualScroll();
      return;
    }
    wordsRef.current = scriptContent.toLowerCase().split(/\s+/).filter(Boolean);
    wordIndexRef.current = 0;
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript + " ";
      }
      const spoken = transcript.toLowerCase().split(/\s+/).filter(Boolean);
      // Ducking: mark recent speech for music gain reduction
      if (spoken.length > 0) lastSpeechRef.current = performance.now();
      // Greedy match: advance index for each spoken word that matches near current position
      for (const w of spoken) {
        const cleanW = w.replace(/[^\p{L}\p{N}]/gu, "");
        if (!cleanW) continue;
        for (let i = wordIndexRef.current; i < Math.min(wordIndexRef.current + 5, wordsRef.current.length); i++) {
          const target = wordsRef.current[i].replace(/[^\p{L}\p{N}]/gu, "");
          if (target === cleanW || (cleanW.length > 3 && target.startsWith(cleanW.slice(0, 4)))) {
            wordIndexRef.current = i + 1;
            break;
          }
        }
      }
      // Scroll to position
      const ratio = wordIndexRef.current / Math.max(wordsRef.current.length, 1);
      if (scrollRef.current) {
        const target = ratio * scrollRef.current.scrollHeight;
        scrollPosRef.current += (target - scrollPosRef.current) * 0.15;
        scrollRef.current.scrollTop = scrollPosRef.current;
      }
    };
    rec.onerror = (e: any) => console.warn("Speech error:", e.error);
    rec.onend = () => {
      if (isRecording && !isPaused) {
        try { rec.start(); } catch {}
      }
    };
    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.warn(e); }
    // Start drift loop so the user can nudge the pace live with the slider/buttons.
    lastTsRef.current = 0;
    const driftTick = (ts: number) => {
      if (!scrollRef.current) return;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const boost = voiceBoostRef.current;
      if (boost !== 0) {
        // Same base formula as manual, scaled by boost (-1..+1) → up to ±1x of manual speed.
        const pxPerSec = (wpmRef.current / 60) * (fontSizeRef.current * 0.18) * boost;
        scrollPosRef.current = Math.max(0, scrollPosRef.current + pxPerSec * dt);
        scrollRef.current.scrollTop = scrollPosRef.current;
      }
      rafRef.current = requestAnimationFrame(driftTick);
    };
    rafRef.current = requestAnimationFrame(driftTick);
  };

  // ========== Music helpers ==========
  const setMusicGain = (v: number, ramp = 0.15) => {
    if (!musicGainRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    musicGainRef.current.gain.cancelScheduledValues(ctx.currentTime);
    musicGainRef.current.gain.setTargetAtTime(v, ctx.currentTime, ramp);
  };

  // Build the combined recording stream: camera+mic from getUserMedia
  // plus music routed through Web Audio so it ends up inside the saved video.
  // The video track is composed from a canvas locked to 9:16 (portrait) or
  // 16:9 (landscape), so the saved file matches what the user sees on stage.
  const startCompositionLoop = (ori: Orientation): MediaStream | null => {
    const camVideo = videoRef.current;
    if (!camVideo) return null;
    const W = ori === "portrait" ? 1080 : 1920;
    const H = ori === "portrait" ? 1920 : 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    compositionCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const mirror = facing === "user" && !settings?.mirror ? false : facing === "user" && settings?.mirror ? true : false;
    // Note: the live <video> preview already mirrors the front camera visually.
    // For the saved file we mirror the front camera too (matches user expectation).
    const mirrorOutput = facing === "user";

    const draw = () => {
      if (!camVideo.videoWidth || !camVideo.videoHeight) {
        compositionRafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      // cover-fit crop centered, with optional CSS-zoom emulation
      const z = zoomRange.native ? 1 : Math.max(0.6, zoom);
      const srcW = camVideo.videoWidth;
      const srcH = camVideo.videoHeight;
      const targetAspect = W / H;
      const srcAspect = srcW / srcH;
      let cropW = srcW;
      let cropH = srcH;
      if (srcAspect > targetAspect) {
        // source wider → crop sides
        cropW = srcH * targetAspect;
      } else {
        // source taller → crop top/bottom
        cropH = srcW / targetAspect;
      }
      // Apply zoom by shrinking the crop window (zoom in) or expanding (zoom out).
      cropW = cropW / z;
      cropH = cropH / z;
      // Clamp to source bounds (zoom < 1 may exceed).
      cropW = Math.min(cropW, srcW);
      cropH = Math.min(cropH, srcH);
      const sx = (srcW - cropW) / 2;
      const sy = (srcH - cropH) / 2;

      ctx.save();
      if (mirrorOutput) {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(camVideo, sx, sy, cropW, cropH, 0, 0, W, H);
      ctx.restore();

      compositionRafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const stream = (canvas as any).captureStream(30) as MediaStream;
    compositionStreamRef.current = stream;
    return stream;
  };

  const stopCompositionLoop = () => {
    if (compositionRafRef.current) {
      cancelAnimationFrame(compositionRafRef.current);
      compositionRafRef.current = null;
    }
    compositionStreamRef.current?.getTracks().forEach((t) => t.stop());
    compositionStreamRef.current = null;
    compositionCanvasRef.current = null;
  };

  const buildRecordingStream = async (ori: Orientation): Promise<MediaStream> => {
    const camStream = streamRef.current!;
    const composedVideo = startCompositionLoop(ori);
    const videoTracks = composedVideo
      ? composedVideo.getVideoTracks()
      : camStream.getVideoTracks();

    if (!music || !musicUrl || !musicAudioRef.current) {
      return new MediaStream([...videoTracks, ...camStream.getAudioTracks()]);
    }

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      await ctx.resume();

      const musicSource = ctx.createMediaElementSource(musicAudioRef.current);
      const musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGainRef.current = musicGain;
      const dest = ctx.createMediaStreamDestination();
      musicDestRef.current = dest;
      musicSource.connect(musicGain);
      musicGain.connect(dest);
      musicGain.connect(ctx.destination);

      const micStream = new MediaStream(camStream.getAudioTracks());
      const micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(dest);

      return new MediaStream([
        ...videoTracks,
        ...dest.stream.getAudioTracks(),
      ]);
    } catch (err) {
      console.warn("Music mix failed, recording without music in video:", err);
      return new MediaStream([...videoTracks, ...camStream.getAudioTracks()]);
    }
  };

  const startMusicPlayback = async () => {
    if (!music || !musicAudioRef.current) return;
    const a = musicAudioRef.current;
    try {
      a.currentTime = music.music_start_seconds || 0;
      a.loop = music.music_loop;
      targetVolRef.current = music.music_volume;
      setMusicVolume(music.music_volume);
      await a.play();
      // Fade in
      const fadeIn = Math.max(0, music.music_fade_in);
      setMusicGain(0, 0.001);
      setTimeout(() => setMusicGain(music.music_volume, fadeIn > 0 ? fadeIn / 3 : 0.05), 50);
    } catch (e) {
      console.warn("Music autoplay failed:", e);
    }
  };

  const stopMusicPlayback = () => {
    if (!musicAudioRef.current) return;
    const fadeOut = music?.music_fade_out ?? 0;
    setMusicGain(0, fadeOut > 0 ? fadeOut / 3 : 0.05);
    setTimeout(() => {
      musicAudioRef.current?.pause();
    }, Math.max(100, fadeOut * 1000));
  };

  // Ducking watcher
  useEffect(() => {
    if (phase !== "recording" || !music?.music_ducking) return;
    const id = window.setInterval(() => {
      if (musicMuted) return;
      const since = performance.now() - lastSpeechRef.current;
      const speaking = since < 1200;
      if (speaking && !duckingActiveRef.current) {
        duckingActiveRef.current = true;
        // Fast attack when speech starts
        setMusicGain(targetVolRef.current * 0.4, 0.08);
      } else if (!speaking && duckingActiveRef.current) {
        duckingActiveRef.current = false;
        // Slow, smooth release back to full volume (avoids pumping on pauses)
        setMusicGain(targetVolRef.current, 0.6);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [phase, music?.music_ducking, musicMuted]);

  // Silent speech detector for ducking in MANUAL mode
  // (in voice mode, the main recognizer already updates lastSpeechRef).
  const duckRecRef = useRef<any>(null);
  useEffect(() => {
    if (phase !== "recording") return;
    if (!music?.music_ducking) return;
    if (mode !== "manual") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      // Any result = user is speaking; just stamp the ref.
      let hasText = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i][0].transcript.trim()) { hasText = true; break; }
      }
      if (hasText) lastSpeechRef.current = performance.now();
    };
    rec.onerror = () => {};
    rec.onend = () => {
      // Auto-restart while still recording
      if (phase === "recording") { try { rec.start(); } catch {} }
    };
    try { rec.start(); } catch {}
    duckRecRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
      duckRecRef.current = null;
    };
  }, [phase, music?.music_ducking, mode]);

  // Music transport controls (live during recording)
  const toggleMusic = () => {
    const a = musicAudioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => {});
      setMusicGain(musicMuted ? 0 : targetVolRef.current, 0.2);
    } else {
      a.pause();
    }
  };
  const seekMusic = (s: number) => {
    if (musicAudioRef.current) musicAudioRef.current.currentTime = s;
  };
  const nudgeMusic = (delta: number) => {
    if (musicAudioRef.current) {
      musicAudioRef.current.currentTime = Math.max(
        0,
        Math.min(musicDuration, musicAudioRef.current.currentTime + delta),
      );
    }
  };
  const changeMusicVolume = (v: number) => {
    setMusicVolume(v);
    targetVolRef.current = v;
    if (!musicMuted) setMusicGain(v, 0.05);
  };
  const toggleMute = () => {
    const next = !musicMuted;
    setMusicMuted(next);
    setMusicGain(next ? 0 : targetVolRef.current, 0.05);
  };

  const fmtTime = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const startCountdownAndRecord = () => {
    if (!streamRef.current) return toast.error("Câmera não disponível");
    if (!scriptContent.trim()) return toast.error("Roteiro vazio");
    // Lock orientation at the moment user hits record (default ON, as approved).
    setLockedOrientation(orientation);
    const sec = settings?.countdown_seconds ?? 3;
    setPhase("countdown");
    setCountdown(sec);
    let n = sec;
    const iv = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(iv);
        beginRecording();
      }
    }, 1000);
  };

  const beginRecording = async () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const ori = lockedOrientation ?? orientation;
    const recordingStream = await buildRecordingStream(ori);
    const mr = new MediaRecorder(recordingStream, { mimeType });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setDuration((Date.now() - startTimeRef.current) / 1000);
      setPhase("review");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recognitionRef.current?.stop?.();
      stopMusicPlayback();
      stopCompositionLoop();
      setLockedOrientation(null);
    };
    mr.start(1000);
    recorderRef.current = mr;
    startTimeRef.current = Date.now();
    setIsRecording(true);
    setIsPaused(false);
    setPhase("recording");
    scrollPosRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (mode === "voice") startVoiceMode();
    else startManualScroll();
    if (music?.music_autoplay) startMusicPlayback();
  };

  const togglePause = () => {
    if (!recorderRef.current) return;
    if (isPaused) {
      recorderRef.current.resume();
      if (mode === "voice") startVoiceMode(); else startManualScroll();
      if (music && musicAudioRef.current && !musicAudioRef.current.ended) {
        musicAudioRef.current.play().catch(() => {});
      }
      setIsPaused(false);
    } else {
      recorderRef.current.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recognitionRef.current?.stop?.();
      musicAudioRef.current?.pause();
      setIsPaused(true);
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    setIsRecording(false);
    setIsPaused(false);
  };

  const discard = () => {
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setPhase("setup");
  };

  const downloadLocal = () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl;
    const safeName = (reviewTitle || "gravacao").replace(/[^\p{L}\p{N}_-]+/gu, "_");
    a.download = `${safeName}.webm`;
    a.click();
  };

  const uploadToCloud = async () => {
    if (!recordedBlob || !user) return;
    setUploading(true);
    const path = `${user.id}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage.from("recordings").upload(path, recordedBlob, {
      contentType: recordedBlob.type,
    });
    if (upErr) {
      setUploading(false);
      return toast.error("Erro no upload: " + upErr.message);
    }
    const { error: dbErr } = await supabase.from("recordings").insert({
      user_id: user.id,
      script_id: scriptId || null,
      title: reviewTitle || "Gravação",
      storage_path: path,
      duration_seconds: duration,
      size_bytes: recordedBlob.size,
      mime_type: recordedBlob.type,
    });
    setUploading(false);
    if (dbErr) return toast.error(dbErr.message);
    toast.success("Gravação salva na nuvem!");
    navigate("/");
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center">
      {/* 9:16 (portrait) or 16:9 (landscape) stage — what you see is what gets saved */}
      <div
        ref={stageRef}
        className="relative bg-black overflow-hidden shadow-2xl"
        style={
          activeOrientation === "portrait"
            ? { aspectRatio: "9 / 16", height: "100vh", maxWidth: "100vw" }
            : { aspectRatio: "16 / 9", width: "100vw", maxHeight: "100vh" }
        }
      >
        {/* Camera live */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full ${zoom < 1 ? "object-contain bg-black" : "object-cover"} ${facing === "user" && !settings?.mirror ? "scale-x-[-1]" : ""}`}
          style={
            zoomRange.native
              ? undefined
              : {
                  transform: `${facing === "user" && !settings?.mirror ? "scaleX(-1) " : ""}scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 120ms ease-out",
                }
          }
        />

        {/* Format badge */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2.5 py-1 rounded-full text-white text-[11px] font-medium">
          <Smartphone className="w-3 h-3" />
          <span>{activeOrientation === "portrait" ? "9:16 Stories" : "16:9"}</span>
          {lockedOrientation && <Lock className="w-3 h-3 ml-0.5 opacity-70" />}
        </div>

      {/* Floating zoom control (visible during setup, countdown and recording) */}
      {phase !== "review" && (
        <div className="absolute top-4 right-4 z-30 flex flex-col items-end gap-2">
          {hasMultipleCameras && (
            <Button
              size="icon"
              variant="secondary"
              className="bg-black/60 text-white hover:bg-black/80 backdrop-blur"
              onClick={switchCamera}
              disabled={switchingCamera}
              title={facing === "user" ? "Trocar para câmera traseira" : "Trocar para câmera frontal"}
            >
              {switchingCamera ? <Loader2 className="w-4 h-4 animate-spin" /> : <SwitchCamera className="w-4 h-4" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="secondary"
            className="bg-black/60 text-white hover:bg-black/80 backdrop-blur"
            onClick={() => setShowZoom((s) => !s)}
            title="Zoom da câmera"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          {showZoom && (
            <div className="bg-black/70 backdrop-blur rounded-lg p-3 w-56 flex flex-col gap-2 text-white shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Zoom</span>
                <span className="tabular-nums">
                  {zoom.toFixed(1)}x{zoomRange.native ? " · óptico" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-white/10"
                  onClick={() =>
                    setZoom((z) => Math.max(zoomRange.min, +(z - zoomRange.step).toFixed(2)))
                  }
                  title="Diminuir zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Slider
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={[zoom]}
                  onValueChange={(v) => setZoom(v[0])}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-white/10"
                  onClick={() =>
                    setZoom((z) => Math.min(zoomRange.max, +(z + zoomRange.step).toFixed(2)))
                  }
                  title="Aumentar zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/10 h-7 text-xs"
                onClick={() => setZoom(zoomRange.native ? zoomRange.min : 1)}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset (mais amplo)
              </Button>
              {!zoomRange.native && (
                <p className="text-[10px] text-white/60 leading-tight">
                  Sua câmera não suporta zoom óptico — usando ajuste visual no preview.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hidden audio element for background music */}
      {musicUrl && (
        <audio
          ref={musicAudioRef}
          src={musicUrl}
          preload="auto"
          crossOrigin="anonymous"
          onLoadedMetadata={(e) => setMusicDuration((e.target as HTMLAudioElement).duration)}
          onTimeUpdate={(e) => setMusicTime((e.target as HTMLAudioElement).currentTime)}
          onPlay={() => setMusicPlaying(true)}
          onPause={() => setMusicPlaying(false)}
          onEnded={() => setMusicPlaying(false)}
        />
      )}

      {/* Top bar */}
      {phase === "setup" && (
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent z-20">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="text-white font-medium truncate max-w-[60%]">{scriptTitle}</span>
          <Button variant="ghost" size="icon" onClick={() => setShowPanel(!showPanel)} className="text-white hover:bg-white/10">
            <Settings2 className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Setup panel */}
      {phase === "setup" && (
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-black/90 to-transparent z-20 space-y-4">
          {showPanel && (
            <Card className="p-4 space-y-3 bg-card/95 backdrop-blur">
              <div>
                <label className="text-xs text-muted-foreground">Tamanho da letra: {fontSize}px</label>
                <Slider value={[fontSize]} min={24} max={80} step={2} onValueChange={(v) => setFontSize(v[0])} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Opacidade do fundo: {Math.round(bgOpacity * 100)}%</label>
                <Slider value={[bgOpacity * 100]} min={0} max={90} step={5} onValueChange={(v) => setBgOpacity(v[0] / 100)} />
              </div>
              {mode === "manual" && (
                <div>
                  <label className="text-xs text-muted-foreground">Velocidade: {wpm} palavras/min</label>
                  <Slider value={[wpm]} min={60} max={500} step={5} onValueChange={(v) => updateWpm(v[0])} />
                </div>
              )}
            </Card>
          )}

          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid grid-cols-2 w-full bg-black/50">
              <TabsTrigger value="manual"><Gauge className="w-4 h-4 mr-2" />Velocidade</TabsTrigger>
              <TabsTrigger value="voice"><Mic className="w-4 h-4 mr-2" />Por voz</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button size="lg" onClick={startCountdownAndRecord} className="w-full bg-red-600 hover:bg-red-700 text-white h-16 text-lg">
            <Circle className="w-6 h-6 mr-2 fill-white" />Iniciar gravação
          </Button>
        </div>
      )}

      {/* Countdown */}
      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/40">
          <div className="text-white text-[180px] font-bold animate-ping-slow">{countdown}</div>
        </div>
      )}

      {/* Teleprompter overlay during recording */}
      {(phase === "recording" || phase === "countdown") && (
        <>
          <div
            className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-2xl overflow-hidden"
            style={{
              width: `${settings?.reading_width ?? 90}%`,
              maxWidth: "900px",
              height: "60vh",
              background: `rgba(0,0,0,${bgOpacity})`,
            }}
          >
            <div
              ref={scrollRef}
              className="w-full h-full overflow-hidden px-8 py-[30vh]"
              style={{ scrollBehavior: "auto" }}
            >
              <div
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.4,
                  color: settings?.text_color ?? "#fff",
                  fontWeight: 600,
                  transform: settings?.mirror ? "scaleX(-1)" : undefined,
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {scriptContent}
              </div>
            </div>
            {/* Center guide line */}
            <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-primary/60 pointer-events-none" />
          </div>

          {/* Recording controls */}
          {phase === "recording" && (
            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 z-20">
              <Button size="lg" variant="secondary" onClick={togglePause} className="rounded-full w-14 h-14 p-0">
                {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </Button>
              <Button size="lg" onClick={stopRecording} className="rounded-full w-20 h-20 p-0 bg-red-600 hover:bg-red-700">
                <Square className="w-8 h-8 fill-white text-white" />
              </Button>
              <div className="w-14 h-14 rounded-full bg-red-600/20 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              </div>
            </div>
          )}

          {/* REC indicator */}
          {phase === "recording" && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono">REC</span>
            </div>
          )}

          {/* Live speed control during recording — manual mode */}
          {phase === "recording" && mode === "manual" && (
            <div className="absolute top-4 right-4 z-20 bg-black/70 backdrop-blur rounded-2xl p-3 w-64 space-y-2 border border-white/10">
              <div className="flex items-center justify-between text-white text-xs">
                <span className="opacity-70">Velocidade</span>
                <span className="font-mono">{wpm} ppm</span>
              </div>
              <Slider value={[wpm]} min={60} max={500} step={5} onValueChange={(v) => updateWpm(v[0])} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1 h-8" onClick={() => updateWpm(wpm - 10)}>
                  <Minus className="w-3 h-3 mr-1" />10
                </Button>
                <Button size="sm" variant="secondary" className="flex-1 h-8" onClick={() => updateWpm(wpm + 10)}>
                  <Plus className="w-3 h-3 mr-1" />10
                </Button>
              </div>
            </div>
          )}

          {/* Live pace control during recording — voice mode */}
          {phase === "recording" && mode === "voice" && (
            <div className="absolute top-4 right-4 z-20 bg-black/70 backdrop-blur rounded-2xl p-3 w-64 space-y-2 border border-white/10">
              <div className="flex items-center justify-between text-white text-xs">
                <span className="opacity-70">Ritmo (voz)</span>
                <span className="font-mono">
                  {voiceBoost === 0 ? "sincronizado" : `${voiceBoost > 0 ? "+" : ""}${Math.round(voiceBoost * 100)}%`}
                </span>
              </div>
              <Slider
                value={[voiceBoost * 100]}
                min={-100}
                max={100}
                step={5}
                onValueChange={(v) => setVoiceBoost(v[0] / 100)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 h-8"
                  onClick={() => setVoiceBoost(Math.max(-1, +(voiceBoost - 0.1).toFixed(2)))}
                >
                  <Minus className="w-3 h-3 mr-1" />Lento
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 h-8"
                  onClick={() => setVoiceBoost(0)}
                >
                  0
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 h-8"
                  onClick={() => setVoiceBoost(Math.min(1, +(voiceBoost + 0.1).toFixed(2)))}
                >
                  <Plus className="w-3 h-3 mr-1" />Rápido
                </Button>
              </div>
            </div>
          )}

          {/* Music mini-player during recording */}
          {phase === "recording" && music && musicUrl && (
            <div className="absolute bottom-32 right-4 z-20 bg-black/75 backdrop-blur rounded-2xl p-3 w-72 space-y-2 border border-white/10 text-white">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" />
                <span className="text-xs truncate flex-1" title={music.music_filename ?? ""}>
                  {music.music_filename || "música"}
                </span>
                <span className="text-[10px] font-mono opacity-70">
                  {fmtTime(musicTime)}/{fmtTime(musicDuration)}
                </span>
              </div>
              <Slider
                value={[musicTime]}
                min={0}
                max={musicDuration || 0.001}
                step={0.5}
                onValueChange={(v) => seekMusic(v[0])}
              />
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={() => nudgeMusic(-10)}>
                  <SkipBack className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={toggleMusic}>
                  {musicPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={() => nudgeMusic(10)}>
                  <SkipForward className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="secondary" className="h-8 w-8 p-0 ml-1" onClick={toggleMute}>
                  {musicMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </Button>
                <Slider
                  value={[musicMuted ? 0 : musicVolume * 100]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => {
                    if (musicMuted) setMusicMuted(false);
                    changeMusicVolume(v[0] / 100);
                  }}
                  className="flex-1"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Review */}
      {phase === "review" && recordedUrl && (
        <div className="absolute inset-0 bg-background z-40 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Check className="w-5 h-5 text-primary" />Gravação pronta</h2>
            <video ref={previewRef} src={recordedUrl} controls className="w-full rounded-lg bg-black" />
            <Input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Título da gravação" />
            <p className="text-sm text-muted-foreground">Duração: {Math.round(duration)}s</p>
            {music && (
              <p className="text-xs text-muted-foreground -mt-2">
                O vídeo baixado já inclui a música mixada.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button variant={music ? "default" : "outline"} onClick={downloadLocal}>
                <Download className="w-4 h-4 mr-2" />Baixar vídeo
              </Button>
              <Button onClick={uploadToCloud} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Salvar na nuvem
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" onClick={discard}>
                <RotateCcw className="w-4 h-4 mr-2" />Regravar
              </Button>
              <Button variant="ghost" onClick={() => navigate("/")}>Sair sem salvar</Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Record;