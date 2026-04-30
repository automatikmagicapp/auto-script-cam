import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Library from "./pages/Library.tsx";
import Auth from "./pages/Auth.tsx";
import ScriptEditor from "./pages/ScriptEditor.tsx";
import Record from "./pages/Record.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Library /></ProtectedRoute>} />
            <Route path="/script/:id" element={<ProtectedRoute><ScriptEditor /></ProtectedRoute>} />
            <Route path="/record/:scriptId" element={<ProtectedRoute><Record /></ProtectedRoute>} />
            <Route path="/record" element={<ProtectedRoute><Record /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
