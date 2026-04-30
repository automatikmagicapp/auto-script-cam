import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Video, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ScriptEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("scripts").select("*").eq("id", id!).single();
      if (error) toast.error(error.message);
      if (data) {
        setTitle(data.title);
        setContent(data.content);
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
          className="flex-1 min-h-[400px] text-base leading-relaxed resize-none"
        />
        <Button size="lg" onClick={recordNow} className="w-full">
          <Video className="w-5 h-5 mr-2" />Gravar agora
        </Button>
      </main>
    </div>
  );
};

export default ScriptEditor;