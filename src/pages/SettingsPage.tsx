import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fontSize, setFontSize] = useState(42);
  const [bgOpacity, setBgOpacity] = useState(0.45);
  const [wpm, setWpm] = useState(140);
  const [readingWidth, setReadingWidth] = useState(90);
  const [countdown, setCountdown] = useState(3);
  const [mirror, setMirror] = useState(false);
  const [defaultMode, setDefaultMode] = useState("manual");
  const [textColor, setTextColor] = useState("#FFFFFF");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).single();
      if (data) {
        setFontSize(data.font_size);
        setBgOpacity(Number(data.bg_opacity));
        setWpm(data.wpm);
        setReadingWidth(data.reading_width);
        setCountdown(data.countdown_seconds);
        setMirror(data.mirror);
        setDefaultMode(data.default_mode);
        setTextColor(data.text_color);
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        font_size: fontSize,
        bg_opacity: bgOpacity,
        wpm,
        reading_width: readingWidth,
        countdown_seconds: countdown,
        mirror,
        default_mode: defaultMode,
        text_color: textColor,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    navigate("/");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 max-w-2xl">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="font-semibold">Configurações</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        <Card className="p-5 space-y-5">
          <h2 className="font-semibold">Visual do teleprompter</h2>
          <div className="space-y-2">
            <Label>Tamanho da letra: {fontSize}px</Label>
            <Slider value={[fontSize]} min={24} max={80} step={2} onValueChange={(v) => setFontSize(v[0])} />
          </div>
          <div className="space-y-2">
            <Label>Opacidade do fundo do texto: {Math.round(bgOpacity * 100)}%</Label>
            <Slider value={[bgOpacity * 100]} min={0} max={90} step={5} onValueChange={(v) => setBgOpacity(v[0] / 100)} />
          </div>
          <div className="space-y-2">
            <Label>Largura da área de leitura: {readingWidth}%</Label>
            <Slider value={[readingWidth]} min={50} max={100} step={5} onValueChange={(v) => setReadingWidth(v[0])} />
          </div>
          <div className="space-y-2">
            <Label>Cor do texto</Label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-full h-10 rounded cursor-pointer bg-transparent border" />
          </div>
        </Card>

        <Card className="p-5 space-y-5">
          <h2 className="font-semibold">Gravação</h2>
          <div className="space-y-2">
            <Label>Velocidade padrão: {wpm} palavras/min</Label>
            <Slider value={[wpm]} min={80} max={250} step={5} onValueChange={(v) => setWpm(v[0])} />
          </div>
          <div className="space-y-2">
            <Label>Contagem regressiva: {countdown}s</Label>
            <Slider value={[countdown]} min={0} max={10} step={1} onValueChange={(v) => setCountdown(v[0])} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mirror">Espelhar texto (prompter físico)</Label>
            <Switch id="mirror" checked={mirror} onCheckedChange={setMirror} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="voice">Modo padrão por voz</Label>
            <Switch id="voice" checked={defaultMode === "voice"} onCheckedChange={(v) => setDefaultMode(v ? "voice" : "manual")} />
          </div>
        </Card>

        <Button size="lg" className="w-full" onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
        </Button>
      </main>
    </div>
  );
};

export default SettingsPage;