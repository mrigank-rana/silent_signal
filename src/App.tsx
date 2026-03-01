import { useState, useEffect, useRef } from "react";
import { User, Contact, Note } from "./types";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import { Shield, AlertTriangle, Settings as SettingsIcon, LogOut, StickyNote } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Background SOS Task
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isSOSActive && user) {
      // Immediate first position
      const updateLocation = () => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            setLocation({ lat: latitude, lng: longitude });
            try {
              await fetch("/api/sos/trigger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, latitude, longitude }),
              });
            } catch (e) {
              console.error("Failed to send SOS update", e);
            }
          },
          (err) => console.error("Geolocation error", err),
          { enableHighAccuracy: true }
        );
      };

      updateLocation();
      interval = setInterval(updateLocation, 30000); // Every 30 seconds

      // Start silent audio recording
      startRecording();
    }

    return () => {
      if (interval) clearInterval(interval);
      stopRecording();
    };
  }, [isSOSActive, user]);

  const startRecording = async () => {
    // Prevent multiple streams
    if (audioStreamRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioRecorderRef.current = recorder;
      
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && user) {
          try {
            await fetch(`/api/sos/audio?userId=${user.id}`, {
              method: "POST",
              headers: { "Content-Type": "audio/webm" },
              body: event.data,
            });
            console.log("[SOS] Audio chunk uploaded");
          } catch (e) {
            console.error("Audio upload failed", e);
          }
        }
      };

      // Record in 10-second chunks
      recorder.start(10000);
      console.log("[SOS] Silent audio recording started (10s chunks)");
    } catch (e) {
      console.error("Failed to start audio recording", e);
    }
  };

  const stopRecording = () => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`[SOS] Stopped track: ${track.label}`);
      });
      audioStreamRef.current = null;
    }
    console.log("[SOS] Silent audio recording and stream fully stopped");
  };

  const stopSOS = () => {
    setIsSOSActive(false);
    stopRecording();
    console.log("[SOS] Emergency protocol deactivated manually.");
  };

  const handleLogin = (userData: User) => {
    setUser(userData);
    if (userData.mode === "DURESS") {
      setIsSOSActive(true);
      // Subtle haptic feedback if available
      if ("vibrate" in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  };

  const handleLogout = () => {
    stopSOS();
    setUser(null);
  };

  const triggerEmergencySOS = async () => {
    // For demo purposes, we trigger SOS for a generic "Emergency" session
    // In a real app, this would use the device's registered owner ID
    const guestUser: User = {
      id: 1, // Default to first user for demo
      username: "Emergency_User",
      mode: "DURESS"
    };
    
    setUser(guestUser);
    setIsSOSActive(true);
    
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]); // SOS vibration
    }
    console.log("[SOS] Emergency override triggered via hidden gesture/pattern");
  };

  if (!user) {
    return <Login onLogin={handleLogin} onTriggerSOS={triggerEmergencySOS} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Decoy Header */}
      <header className="h-16 border-b border-zinc-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-zinc-900/10">
            <StickyNote size={20} />
          </div>
          <div>
            <h1 className="font-serif font-bold text-xl tracking-tight leading-none">QuickNotes</h1>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mt-1">Personal Workspace</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-full text-zinc-500 text-xs font-medium">
            <div className={`w-1.5 h-1.5 rounded-full ${isSOSActive ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
            {isSOSActive ? "Emergency Sync" : "Cloud Synced"}
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 rounded-xl transition-all text-zinc-600 font-bold text-sm"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <Dashboard user={user} isSOSActive={isSOSActive} onStopSOS={stopSOS} />

      {/* Hidden SOS Indicator (Only for developer/debug, normally invisible) */}
      {isSOSActive && (
        <div className="fixed bottom-4 right-4 opacity-0 pointer-events-none">
          <Shield className="text-red-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}
