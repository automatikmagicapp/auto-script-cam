import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Music, Upload, Trash2, Play, Pause, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ScriptMusicConfig {
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

interface Props {
  scriptId: string;
  userId: string;
  config: ScriptMusicConfig;
  onChange: (next: ScriptMusicConfig) => void;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const MusicPanel = ({ scriptId, userId, config, onChange }: Props) => {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const saveTimer = useRef<number | null>(null);

  // Load signed URL when path changes
  useEffect(() => {
    let active = true;
    if (!config.music_path) {
      setSignedUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from("script-music")
        .createSignedUrl(config.music_path!, 3600);
      if (!active) return;
      if (error || !data) {
        toast.error("Erro ao carregar música");
        return;
      }
      setSignedUrl(data.signedUrl);
    })();
    return () => {
      active = false;
    };
  }, [config.music_path]);

  // Apply volume live
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = config.music_volume;
  }, [config.music_volume]);

  // Persist config (debounced)
  const persist = (next: Partial<ScriptMusicConfig>) => {
    const merged = { ...config, ...next };
    onChange(merged);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("scripts")
        .update({
          music_path: merged.music_path,
          music_filename: merged.music_filename,
          music_autoplay: merged.music_autoplay,
          music_volume: merged.music_volume,
          music_loop: merged.music_loop,
          music_start_seconds: merged.music_start_seconds,
          music_ducking: merged.music_ducking,
          music_fade_in: merged.music_fade_in,
          music_fade_out: merged.music_fade_out,
        })
        .eq("id", scriptId);
      if (error) toast.error("Erro ao salvar configuração da música");
    }, 500);
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      return toast.error("Selecione um arquivo de áudio (MP3)");
    }
    if (file.size > MAX_BYTES) {
      return toast.error("Arquivo muito grande. Máximo: 15 MB");
    }
    setUploading(true);
    const path = `${userId}/${scriptId}.mp3`;
    // Remove previous if exists
    if (config.music_path) {
      await supabase.storage.from("script-music").remove([config.music_path]);
    }
    const { error } = await supabase.storage
      .from("script-music")
      .upload(path, file, { contentType: file.type, upsert: true });
    setUploading(false);
    if (error) return toast.error("Erro no upload: " + error.message);
    persist({ music_path: path, music_filename: file.name });
    toast.success("Música anexada");
  };

  const handleRemove = async () => {
    if (!config.music_path) return;
    if (!confirm("Remover a música deste roteiro?")) return;
    await supabase.storage.from("script-music").remove([config.music_path]);
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
    persist({ music_path: null, music_filename: null });
    toast.success("Música removida");
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => toast.error("Não foi possível tocar"));
    } else {
      a.pause();
    }
  };

  const seek = (v: number) => {
    if (audioRef.current) audioRef.current.currentTime = v;
    setCurrent(v);
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <Music className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Música de fundo</h3>
      </div>

      {!config.music_path ? (
        <label className="block">
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <Button asChild variant="outline" className="w-full" disabled={uploading}>
            <span>
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {uploading ? "Enviando..." : "Adicionar MP3 (até 15 MB)"}
            </span>
          </Button>
        </label>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm truncate flex-1" title={config.music_filename ?? ""}>
              {config.music_filename || "música.mp3"}
            </span>
            <Button size="sm" variant="ghost" onClick={handleRemove}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>

          {signedUrl && (
            <audio
              ref={audioRef}
              src={signedUrl}
              preload="metadata"
              onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
              onTimeUpdate={(e) => setCurrent((e.target as HTMLAudioElement).currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={togglePlay} className="h-9 w-9 p-0">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <span className="text-xs font-mono tabular-nums w-12">{fmt(current)}</span>
            <Slider
              value={[current]}
              min={0}
              max={duration || 0.001}
              step={0.1}
              onValueChange={(v) => seek(v[0])}
              className="flex-1"
            />
            <span className="text-xs font-mono tabular-nums w-12 text-right">{fmt(duration)}</span>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              Volume inicial: {Math.round(config.music_volume * 100)}%
            </label>
            <Slider
              value={[config.music_volume * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => persist({ music_volume: v[0] / 100 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span>Tocar ao gravar</span>
              <Switch
                checked={config.music_autoplay}
                onCheckedChange={(v) => persist({ music_autoplay: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Loop</span>
              <Switch
                checked={config.music_loop}
                onCheckedChange={(v) => persist({ music_loop: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-2 col-span-2">
              <span>Abaixar na fala (ducking)</span>
              <Switch
                checked={config.music_ducking}
                onCheckedChange={(v) => persist({ music_ducking: v })}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Início (s)</label>
              <Input
                type="number"
                min={0}
                value={config.music_start_seconds}
                onChange={(e) =>
                  persist({ music_start_seconds: Math.max(0, parseInt(e.target.value || "0")) })
                }
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fade in (s)</label>
              <Input
                type="number"
                min={0}
                value={config.music_fade_in}
                onChange={(e) =>
                  persist({ music_fade_in: Math.max(0, parseInt(e.target.value || "0")) })
                }
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fade out (s)</label>
              <Input
                type="number"
                min={0}
                value={config.music_fade_out}
                onChange={(e) =>
                  persist({ music_fade_out: Math.max(0, parseInt(e.target.value || "0")) })
                }
                className="h-9"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};