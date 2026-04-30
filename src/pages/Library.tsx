import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FileText, Video, LogOut, Settings, Download, Share2, Trash2, Play, Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Script {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}
interface Recording {
  id: string;
  title: string;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string;
}

const Library = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, r] = await Promise.all([
      supabase.from("scripts").select("*").order("updated_at", { ascending: false }),
      supabase.from("recordings").select("*").order("created_at", { ascending: false }),
    ]);
    if (s.data) setScripts(s.data as Script[]);
    if (r.data) setRecordings(r.data as Recording[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const newScript = async () => {
    const { data, error } = await supabase
      .from("scripts")
      .insert({ user_id: user!.id, title: "Novo roteiro", content: "" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    navigate(`/script/${data.id}`);
  };

  const deleteScript = async (id: string) => {
    if (!confirm("Apagar este roteiro?")) return;
    const { error } = await supabase.from("scripts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setScripts((s) => s.filter((x) => x.id !== id));
  };

  const playRecording = async (path: string) => {
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(path, 3600);
    if (error || !data) return toast.error("Erro ao carregar vídeo");
    setPlayingUrl(data.signedUrl);
  };

  const downloadRecording = async (path: string, title: string) => {
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(path, 3600);
    if (error || !data) return toast.error("Erro ao gerar link");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = `${title}.webm`;
    a.click();
  };

  const shareRecording = async (path: string) => {
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(path, 60 * 60 * 24);
    if (error || !data) return toast.error("Erro");
    await navigator.clipboard.writeText(data.signedUrl);
    toast.success("Link copiado (válido por 24h)");
  };

  const deleteRecording = async (rec: Recording) => {
    if (!confirm("Apagar esta gravação?")) return;
    await supabase.storage.from("recordings").remove([rec.storage_path]);
    await supabase.from("recordings").delete().eq("id", rec.id);
    setRecordings((r) => r.filter((x) => x.id !== rec.id));
    toast.success("Gravação apagada");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Clapperboard className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold">Teleprompter</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}><Settings className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Tabs defaultValue="scripts" className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="scripts"><FileText className="w-4 h-4 mr-2" />Roteiros</TabsTrigger>
            <TabsTrigger value="recordings"><Video className="w-4 h-4 mr-2" />Gravações</TabsTrigger>
          </TabsList>

          <TabsContent value="scripts" className="space-y-3">
            <Button onClick={newScript} className="w-full" size="lg">
              <Plus className="w-5 h-5 mr-2" />Novo roteiro
            </Button>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : scripts.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                Nenhum roteiro ainda. Crie o primeiro!
              </Card>
            ) : (
              scripts.map((s) => (
                <Card key={s.id} className="p-4 hover:border-primary transition-colors">
                  <div className="flex justify-between gap-3">
                    <Link to={`/script/${s.id}`} className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{s.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{s.content || "Vazio"}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </Link>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => navigate(`/record/${s.id}`)}>
                        <Video className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteScript(s.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="recordings" className="space-y-3">
            {playingUrl && (
              <Card className="p-2 overflow-hidden">
                <video src={playingUrl} controls autoPlay className="w-full rounded" />
                <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setPlayingUrl(null)}>Fechar</Button>
              </Card>
            )}
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : recordings.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <Video className="w-10 h-10 mx-auto mb-2 opacity-50" />
                Nenhuma gravação ainda.
              </Card>
            ) : (
              recordings.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{r.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.duration_seconds ? `${Math.round(r.duration_seconds)}s • ` : ""}
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => playRecording(r.storage_path)}><Play className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => downloadRecording(r.storage_path, r.title)}><Download className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => shareRecording(r.storage_path)}><Share2 className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteRecording(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Library;