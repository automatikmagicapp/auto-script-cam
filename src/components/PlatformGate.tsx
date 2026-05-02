import { Capacitor } from "@capacitor/core";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const isPreviewHost = () => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("lovableproject.com") || h.includes("id-preview--") || h === "localhost" || h === "127.0.0.1";
};

const shouldAllow = () => Capacitor.isNativePlatform() || isPreviewHost();

export const PlatformGate = ({ children }: { children: React.ReactNode }) => {
  if (shouldAllow()) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Autoteleprompter</h1>
          <p className="text-muted-foreground">
            Este aplicativo está disponível apenas como app Android. Instale o APK no seu celular para usar.
          </p>
        </div>
        <Button className="w-full" disabled>
          Baixar APK em breve
        </Button>
      </div>
    </div>
  );
};

export default PlatformGate;