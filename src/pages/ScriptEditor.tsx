import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Video, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MusicPanel, type ScriptMusicConfig } from "@/components/MusicPanel";

const ScriptEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [music, setMusic] = useState<ScriptMusicConfig>({
    music_path: null,
    music_filename: null,
    music_autoplay: false,
    music_volume: 0.6,
    music_loop: true,
    music_start_seconds: 0,
    music_ducking: true,
    music_fade_in: 2,
    music_fade_out: 2,
  });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("scripts").select("*").eq("id", id!).single();
      if (error) toast.error(error.message);
      if (data) {
        setTitle(data.title);
        setContent(data.content);
        setMusic({
          music_path: data.music_path,
          music_filename: data.music_filename,
          music_autoplay: data.music_autoplay,
          music_volume: Number(data.music_volume),
          music_loop: data.music_loop,
          music_start_seconds: data.music_start_seconds,
          music_ducking: data.music_ducking,
          music_fade_in: data.music_fade_in,
          music_fade_out: data.music_fade_out,
        });
      }
      setLoading(false);
    })();
  }, [id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("scripts").update({ title, content }).eq("id", id!);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
  };

  const recordNow = async () => {
    await save();
    navigate(`/record/${id}`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></Button>
          <span className="text-sm text-muted-foreground">{wordCount} palavras</span>
          <Button variant="ghost" size="icon" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          </Button>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-4 max-w-3xl flex flex-col gap-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="text-lg font-semibold"
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Cole ou escreva o texto que você vai ler..."
          className="min-h-[300px] text-base leading-relaxed resize-none"
        />
        {user && id && (
          <MusicPanel scriptId={id} userId={user.id} config={music} onChange={setMusic} />
        )}
        <Button size="lg" onClick={recordNow} className="w-full">
          <Video className="w-5 h-5 mr-2" />Gravar agora
        </Button>
      </main>
    </div>
  );
};

export default ScriptEditor;