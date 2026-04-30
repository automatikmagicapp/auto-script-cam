import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Circle, Square, Pause, Play, Loader2, Mic, Gauge, Settings2, Upload, RotateCcw, Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

type Phase = "setup" | "countdown" | "recording" | "review";
type Mode = "manual" | "voice";

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

  // Teleprompter scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  // Voice mode
  const recognitionRef = useRef<any>(null);
  const wordsRef = useRef<string[]>([]);
  const wordIndexRef = useRef(0);

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
  const initCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error("Não foi possível acessar a câmera/microfone");
      console.error(err);
    }
  }, []);

  useEffect(() => {
    initCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recognitionRef.current?.stop?.();
    };
  }, [initCamera]);

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
  };

  const startCountdownAndRecord = () => {
    if (!streamRef.current) return toast.error("Câmera não disponível");
    if (!scriptContent.trim()) return toast.error("Roteiro vazio");
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

  const beginRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setDuration((Date.now() - startTimeRef.current) / 1000);
      setPhase("review");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recognitionRef.current?.stop?.();
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
  };

  const togglePause = () => {
    if (!recorderRef.current) return;
    if (isPaused) {
      recorderRef.current.resume();
      if (mode === "voice") startVoiceMode(); else startManualScroll();
      setIsPaused(false);
    } else {
      recorderRef.current.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recognitionRef.current?.stop?.();
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
    a.download = `${reviewTitle || "gravacao"}.webm`;
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
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Camera live */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover ${settings?.mirror ? "" : "scale-x-[-1]"}`}
      />

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
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={downloadLocal}>
                <Upload className="w-4 h-4 mr-2 rotate-180" />Baixar
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
  );
};

export default Record;