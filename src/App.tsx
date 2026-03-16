import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, orderBy, writeBatch, doc, setDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { Car, Truck, MapPin, MapPinOff, LogIn, LogOut, AlertCircle, Trash2, Package, Download, Mail } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type VehicleType = 'car' | 'truck' | 'dumpster' | 'commercial_truck';
type StreetSide = 'left' | 'right';

interface CountRecord {
  id?: string;
  type: VehicleType;
  side: StreetSide;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  userId: string;
  neighborhood?: string | null;
  purpose?: string | null;
  sessionDate?: string | null;
  sessionId?: string;
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Audio & Haptics ---
let audioCtx: AudioContext | null = null;
const playPopSound = (type: VehicleType) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    
    let startFreq = 800;
    let endFreq = 300;
    
    switch (type) {
      case 'car':
        startFreq = 1000;
        endFreq = 400;
        break;
      case 'truck':
        startFreq = 700;
        endFreq = 250;
        break;
      case 'dumpster':
        startFreq = 450;
        endFreq = 150;
        break;
      case 'commercial_truck':
        startFreq = 300;
        endFreq = 80;
        break;
    }
    
    osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

const playSyncSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const mainGain = audioCtx.createGain();
    
    // Delay setup for 300ms reverb effect
    const delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = 0.3; // 300ms
    
    const feedbackGain = audioCtx.createGain();
    feedbackGain.gain.value = 0.4; // Feedback amount
    
    // Routing
    osc.connect(mainGain);
    mainGain.connect(audioCtx.destination);
    
    // Delay routing
    mainGain.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(audioCtx.destination);
    
    // Tone setup (swoop down, sustained)
    osc.type = 'sine';
    
    const now = audioCtx.currentTime;
    const duration = 0.8; // sustained tone
    
    // Swoop down
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + duration);
    
    // Volume envelope
    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(0.3, now + 0.1); // fade in
    mainGain.gain.exponentialRampToValueAtTime(0.01, now + duration); // fade out
    
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountRecord[]>([]);
  const [pendingCounts, setPendingCounts] = useState<CountRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastTap, setLastTap] = useState<{ side: StreetSide, type: VehicleType } | null>(null);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('');
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState<string[]>([
    'Downtown', 'Northside', 'Southside', 'Eastside', 'Westside'
  ]);
  const lastGeocoded = useRef<{lat: number, lon: number} | null>(null);

  // --- Session State ---
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [showEndSessionScreen, setShowEndSessionScreen] = useState(false);
  const [isViewingShared, setIsViewingShared] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('sessionId');
  });
  const [viewMode, setViewMode] = useState<'count' | 'chart' | 'table'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('sessionId') ? 'table' : 'count';
  });
  const [sessionId, setSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('sessionId') || crypto.randomUUID();
  });
  const [purpose, setPurpose] = useState('');
  const [sessionDate, setSessionDate] = useState<Date | null>(new Date());
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [isViewingSessionsList, setIsViewingSessionsList] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('review');
  });
  const [sessionsList, setSessionsList] = useState<any[]>([]);

  // --- Auth Effect ---
  useEffect(() => {
    // Test connection
    const testConnection = async () => {
      try {
        const { doc, getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // --- Geolocation Effect ---
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(position);
        setLocationError(null);
      },
      (error) => {
        let errorMessage = "Unknown error";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable";
            break;
          case error.TIMEOUT:
            errorMessage = "The request to get user location timed out";
            break;
        }
        setLocationError(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- Reverse Geocoding Effect ---
  useEffect(() => {
    if (!location) return;

    const lat = location.coords.latitude;
    const lon = location.coords.longitude;

    // Only geocode if we moved more than ~100 meters (approx 0.001 degrees)
    if (lastGeocoded.current) {
      const dLat = Math.abs(lastGeocoded.current.lat - lat);
      const dLon = Math.abs(lastGeocoded.current.lon - lon);
      if (dLat < 0.001 && dLon < 0.001) return;
    }

    lastGeocoded.current = { lat, lon };

    const fetchNeighborhood = async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        if (!res.ok) return;
        const data = await res.json();
        const neighborhood = data.address?.neighbourhood || data.address?.suburb || data.address?.city_district || data.address?.town || data.address?.city;
        
        if (neighborhood) {
          setAvailableNeighborhoods(prev => {
            if (!prev.includes(neighborhood)) {
              return [...prev, neighborhood];
            }
            return prev;
          });
          setSelectedNeighborhood(neighborhood);
        }
      } catch (e) {
        console.error("Reverse geocoding failed", e);
      }
    };

    // Debounce to avoid hitting API rate limits
    const timeoutId = setTimeout(fetchNeighborhood, 1500);
    return () => clearTimeout(timeoutId);
  }, [location?.coords.latitude, location?.coords.longitude]);

  // --- Sessions Fetching Effect ---
  useEffect(() => {
    if (!isAuthReady || !user || !isViewingSessionsList) {
      setSessionsList([]);
      return;
    }

    const q = query(
      collection(db, 'sessions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const newSessions: any[] = [];
        snapshot.forEach((doc) => {
          newSessions.push({ id: doc.id, ...doc.data() });
        });
        newSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setSessionsList(newSessions);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sessions');
      }
    );

    return () => unsubscribe();
  }, [user, isAuthReady, isViewingSessionsList]);

  // --- Data Fetching Effect ---
  useEffect(() => {
    if (!isAuthReady || !user) {
      setCounts([]);
      return;
    }

    const q = isViewingShared
      ? query(
          collection(db, 'counts'),
          where('sessionId', '==', sessionId)
        )
      : query(
          collection(db, 'counts'),
          where('userId', '==', user.uid),
          where('sessionId', '==', sessionId)
        );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const newCounts: CountRecord[] = [];
        snapshot.forEach((doc) => {
          newCounts.push({ id: doc.id, ...doc.data() } as CountRecord);
        });
        // Sort in memory to avoid needing a composite index for timestamp
        newCounts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setCounts(newCounts);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'counts');
      }
    );

    return () => unsubscribe();
  }, [user, isAuthReady, sessionId]);

  // --- Record Count ---
  const handleTap = useCallback(async (side: StreetSide, type: VehicleType) => {
    if (!user) {
      setSaveError("Please log in to record counts.");
      return;
    }
    if (!location) {
      setSaveError("Waiting for GPS location...");
      return;
    }

    setSaveError(null);
    setLastTap({ side, type });

    // Haptic & Audio feedback
    if (navigator.vibrate) {
      navigator.vibrate(40);
    }
    playPopSound(type);

    // Clear the tap highlight after a short delay
    setTimeout(() => setLastTap(null), 200);

    const newRecord: CountRecord = {
      type,
      side,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      neighborhood: selectedNeighborhood || null,
      purpose: purpose || null,
      sessionDate: sessionDate ? sessionDate.toISOString() : new Date().toISOString(),
      sessionId
    };

    setPendingCounts(prev => [...prev, newRecord]);
  }, [user, location, selectedNeighborhood, purpose, sessionDate, sessionId]);

  // --- Export CSV Helpers ---
  const getCsvData = useCallback(() => {
    const currentCounts = [...counts, ...pendingCounts];
    
    if (currentCounts.length === 0) {
      throw new Error("No data available to export.");
    }

    const headers = ['Timestamp', 'Type', 'Side', 'Neighborhood', 'Purpose', 'Latitude', 'Longitude', 'Accuracy'];
    
    const rows = currentCounts.map(count => {
      if (!count.timestamp || !count.type || !count.side) {
        throw new Error("Data contains malformed records. Export aborted.");
      }
      return [
        new Date(count.timestamp).toISOString(),
        count.type,
        count.side,
        count.neighborhood || '',
        count.purpose || '',
        count.latitude,
        count.longitude,
        count.accuracy
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Format: YYYY-MMM-DD-Purpose-Neighborhood
    const date = sessionDate || new Date();
    const year = date.getFullYear();
    const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    const safePurpose = purpose ? purpose.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'no_purpose';
    const safeNeighborhood = selectedNeighborhood ? selectedNeighborhood.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'no_neighborhood';
    
    const filename = `${formattedDate}-${safePurpose}-${safeNeighborhood}.csv`;
    
    return { blob, filename };
  }, [counts, pendingCounts, sessionDate, purpose, selectedNeighborhood]);

  const handleExportCSV = useCallback(() => {
    try {
      setExportError(null);
      const { blob, filename } = getCsvData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export CSV.");
      setTimeout(() => setExportError(null), 5000);
    }
  }, [getCsvData]);

  const handleShareCSV = useCallback(async () => {
    try {
      setExportError(null);
      const { blob, filename } = getCsvData();
      const file = new File([blob], filename, { type: 'text/csv' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Traffic Counts Export',
            text: 'Attached is the traffic counts CSV export.',
          });
        } catch (error) {
          console.error('Error sharing:', error);
          setExportError("Failed to share the file.");
          setTimeout(() => setExportError(null), 5000);
        }
      } else {
        alert('Sharing files via email/apps is not supported on this browser. Downloading instead.');
        handleExportCSV();
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to generate CSV for sharing.");
      setTimeout(() => setExportError(null), 5000);
    }
  }, [getCsvData, handleExportCSV]);

  // --- Sync Pending Counts ---
  const handleSync = useCallback(async () => {
    if (pendingCounts.length === 0 || isSaving) return;
    
    setIsSaving(true);
    setSaveError(null);

    // Play sync sound
    playSyncSound();

    try {
      const batch = writeBatch(db);
      pendingCounts.forEach(record => {
        const newDocRef = doc(collection(db, 'counts'));
        batch.set(newDocRef, record);
      });
      
      await batch.commit();
      setPendingCounts([]); // Clear pending on success
    } catch (error) {
      setSaveError("Failed to sync counts.");
      handleFirestoreError(error, OperationType.WRITE, 'counts');
    } finally {
      setIsSaving(false);
    }
  }, [pendingCounts, isSaving]);

  const handleExportSessionsCSV = () => {
    if (sessionsList.length === 0) return;

    const headers = ['Neighborhood', 'Purpose', 'Start Time', 'End Time', 'Total Counts', 'Session ID'];
    const csvRows = [
      headers.join(','),
      ...sessionsList.map(s => [
        `"${s.neighborhood || ''}"`,
        `"${s.purpose || ''}"`,
        `"${new Date(s.startTime).toLocaleString()}"`,
        `"${new Date(s.endTime).toLocaleString()}"`,
        s.totalCounts,
        s.sessionId
      ].join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `traffic_sessions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Start New Session ---
  const handleStartNewSession = async () => {
    if (pendingCounts.length > 0) {
      await handleSync();
    }
    setSessionId(crypto.randomUUID());
    setSessionStartTime(new Date());
    setIsSessionActive(true);
  };

  // --- End Session ---
  const handleEndSession = async () => {
    await handleSync();
    setIsSessionActive(false);
    setShowEndSessionScreen(true);
    
    if (user && sessionStartTime) {
      const sessionRecord = {
        sessionId,
        userId: user.uid,
        startTime: sessionStartTime.toISOString(),
        endTime: new Date().toISOString(),
        neighborhood: selectedNeighborhood || null,
        purpose: purpose || null,
        totalCounts: counts.length + pendingCounts.length
      };
      
      try {
        await setDoc(doc(db, 'sessions', sessionId), sessionRecord);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'sessions');
      }
    }
  };

  // --- Keyboard Listener for Spacebar Sync ---
  useEffect(() => {
    if (!isSessionActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default scrolling behavior for spacebar
      if (e.code === 'Space') {
        e.preventDefault();
        handleSync();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, handleSync]);

  // --- UI Helpers ---
  const allCounts = [...counts, ...pendingCounts];
  const totalCars = allCounts.filter(c => c.type === 'car').length;
  const totalTrucks = allCounts.filter(c => c.type === 'truck').length;
  const totalDumpsters = allCounts.filter(c => c.type === 'dumpster').length;
  const totalCommTrucks = allCounts.filter(c => c.type === 'commercial_truck').length;
  const leftSideCount = allCounts.filter(c => c.side === 'left').length;
  const rightSideCount = allCounts.filter(c => c.side === 'right').length;

  const chartData = [
    {
      name: 'Car',
      Left: allCounts.filter(c => c.type === 'car' && c.side === 'left').length,
      Right: allCounts.filter(c => c.type === 'car' && c.side === 'right').length,
    },
    {
      name: 'Truck',
      Left: allCounts.filter(c => c.type === 'truck' && c.side === 'left').length,
      Right: allCounts.filter(c => c.type === 'truck' && c.side === 'right').length,
    },
    {
      name: 'Dumpster',
      Left: allCounts.filter(c => c.type === 'dumpster' && c.side === 'left').length,
      Right: allCounts.filter(c => c.type === 'dumpster' && c.side === 'right').length,
    },
    {
      name: 'Comm. Truck',
      Left: allCounts.filter(c => c.type === 'commercial_truck' && c.side === 'left').length,
      Right: allCounts.filter(c => c.type === 'commercial_truck' && c.side === 'right').length,
    },
  ];

  if (!isAuthReady) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-3xl shadow-2xl border border-zinc-800">
          <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Car size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Street Counter</h1>
          <p className="text-zinc-400 mb-8">
            Log in to start counting parked vehicles and recording their GPS locations.
          </p>
          <button
            onClick={loginWithGoogle}
            className="w-full bg-white text-zinc-950 font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors active:scale-95"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (showEndSessionScreen) {
    const sessionUrl = `${window.location.origin}?sessionId=${sessionId}`;
    const mailtoLink = `mailto:mark.hill@edmonton.ca?subject=Traffic Count Session Data&body=Here is the link to the session data table:%0D%0A%0D%0A${encodeURIComponent(sessionUrl)}`;

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-4 flex items-center justify-between z-10 shrink-0">
          <h1 className="font-bold text-lg tracking-tight">Session Summary</h1>
        </header>

        <main className="flex-1 p-6 flex flex-col gap-6 max-w-md mx-auto w-full justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-2">
              <Package size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white">Session Complete</h2>
            <p className="text-zinc-400">
              You recorded <strong className="text-white">{allCounts.length}</strong> vehicles during this session.
            </p>
            
            <a
              href={mailtoLink}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl transition-colors mt-4 block text-center"
            >
              Submit Session Data
            </a>

            <button
              onClick={() => {
                setShowEndSessionScreen(false);
                setSessionId(crypto.randomUUID());
                setSessionStartTime(null);
                setCounts([]);
                setPendingCounts([]);
                setPurpose('');
                setSessionDate(new Date());
              }}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 px-6 rounded-xl transition-colors"
            >
              Start New Session
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isViewingSessionsList) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-4 flex items-center justify-between z-10 shrink-0">
          <h1 className="font-bold text-lg tracking-tight">Review Sessions</h1>
          <button 
            onClick={() => window.location.href = window.location.origin}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Back
          </button>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-4 max-w-md mx-auto w-full overflow-y-auto">
          {sessionsList.length > 0 && (
            <button
              onClick={handleExportSessionsCSV}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 mb-2"
            >
              <Download size={18} />
              Export Sessions Summary (CSV)
            </button>
          )}
          {sessionsList.length === 0 ? (
            <div className="text-center text-zinc-500 mt-10">
              No sessions found.
            </div>
          ) : (
            sessionsList.map(session => (
              <div key={session.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white">{session.neighborhood || 'Unknown Neighborhood'}</h3>
                    <p className="text-sm text-zinc-400">{session.purpose || 'No purpose specified'}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-indigo-400">{session.totalCounts}</div>
                    <div className="text-xs text-zinc-500">counts</div>
                  </div>
                </div>
                <div className="text-xs text-zinc-500 mt-2">
                  {new Date(session.startTime).toLocaleString()} - {new Date(session.endTime).toLocaleTimeString()}
                </div>
                <button
                  onClick={() => {
                    window.location.href = `?sessionId=${session.sessionId}`;
                  }}
                  className="mt-2 w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  View Details & Export
                </button>
              </div>
            ))
          )}
        </main>
      </div>
    );
  }

  if (!isSessionActive && !isViewingShared) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-4 flex items-center justify-between z-10 shrink-0">
          <h1 className="font-bold text-lg tracking-tight">Setup Session</h1>
          <button 
            onClick={logout}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </header>

        <main className="flex-1 p-6 flex flex-col gap-6 max-w-md mx-auto w-full">
          <button
            onClick={() => window.location.href = '?review=true'}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Review Past Sessions
          </button>

          <button
            onClick={() => {
              if (!sessionStartTime) setSessionStartTime(new Date());
              setIsSessionActive(true);
            }}
            disabled={!location}
            className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Return to current session
          </button>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-5">
            
            {/* Neighborhood */}
            <div>
              <label htmlFor="neighborhood" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Neighborhood (Auto-detected via GPS)
              </label>
              <select
                id="neighborhood"
                value={selectedNeighborhood}
                onChange={(e) => setSelectedNeighborhood(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 text-white text-base rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3"
              >
                <option value="">None selected</option>
                {availableNeighborhoods.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Date / Time */}
            <div>
              <label htmlFor="sessionDate" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Date / Time
              </label>
              <div className="w-full">
                <DatePicker
                  id="sessionDate"
                  selected={sessionDate}
                  onChange={(date) => setSessionDate(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  timeCaption="Time"
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full bg-zinc-950 border border-zinc-700 text-white text-base rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3"
                  wrapperClassName="w-full"
                />
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label htmlFor="purpose" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Purpose of the count
              </label>
              <select
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 text-white text-base rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3"
              >
                <option value="">Select a purpose...</option>
                <option value="Business Improvement Area">Business Improvement Area</option>
                <option value="EPark-Paid Parking">EPark-Paid Parking</option>
                <option value="Residential Parking Permit Zone">Residential Parking Permit Zone</option>
              </select>
            </div>

          </div>
          
          <button
            onClick={handleStartNewSession}
            disabled={!location || isSaving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 mt-auto"
          >
            {isSaving ? "Saving..." : location ? "Start New Session" : "Waiting for GPS..."}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden fixed inset-0">
      
      {/* --- Header / Status Bar --- */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          {!isViewingShared && (
            <button 
              onClick={handleEndSession}
              className="text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition-colors"
            >
              End Session
            </button>
          )}
          {isViewingShared && (
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  window.location.href = window.location.origin + '?review=true';
                }}
                className="text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition-colors"
              >
                Back to List
              </button>
              <button 
                onClick={() => {
                  window.location.href = window.location.origin;
                }}
                className="text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-full transition-colors"
              >
                Start New Session
              </button>
            </div>
          )}
          <div className="flex bg-zinc-800 rounded-full p-0.5">
            {!isViewingShared && (
              <button 
                onClick={() => setViewMode('count')}
                className={cn("text-xs font-medium px-3 py-1 rounded-full transition-colors", viewMode === 'count' ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}
              >
                Counter
              </button>
            )}
            <button 
              onClick={() => setViewMode('chart')}
              className={cn("text-xs font-medium px-3 py-1 rounded-full transition-colors", viewMode === 'chart' ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}
            >
              Chart
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={cn("text-xs font-medium px-3 py-1 rounded-full transition-colors", viewMode === 'table' ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}
            >
              Table
            </button>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            location ? (location.coords.accuracy <= 20 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400") : "bg-red-500/10 text-red-400"
          )}>
            {location ? <MapPin size={14} /> : <MapPinOff size={14} />}
            {location ? `GPS: ±${Math.round(location.coords.accuracy)}m` : "No GPS"}
          </div>
          {isSaving && <span className="text-xs text-zinc-500 animate-pulse">Saving...</span>}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right flex items-center gap-3">
            {pendingCounts.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Pending</div>
                <div className="text-sm font-bold text-emerald-400">+{pendingCounts.length}</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Synced</div>
              <div className="text-sm font-bold">{counts.length}</div>
            </div>
          </div>
        </div>
      </header>

      {/* --- Error Toast --- */}
      {(locationError || saveError || exportError) && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-start gap-2 text-red-400 text-sm shrink-0">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{locationError || saveError || exportError}</p>
        </div>
      )}

      {/* --- Stats Summary --- */}
      <div className="px-4 py-3 grid grid-cols-3 md:grid-cols-6 gap-2 text-center shrink-0 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Cars</div>
          <div className="font-mono text-lg">{totalCars}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Trucks</div>
          <div className="font-mono text-lg">{totalTrucks}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Dumpsters</div>
          <div className="font-mono text-lg">{totalDumpsters}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Comm. Trucks</div>
          <div className="font-mono text-lg">{totalCommTrucks}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Left</div>
          <div className="font-mono text-lg">{leftSideCount}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Right</div>
          <div className="font-mono text-lg">{rightSideCount}</div>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      {viewMode === 'count' ? (
        <>
          {/* --- Controller Area --- */}
          <main className="flex-1 flex flex-col relative">
        
        {/* The "Street" Visual Separator */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-16 flex flex-col items-center justify-center pointer-events-none opacity-20">
          <div className="w-1 h-full bg-gradient-to-b from-transparent via-white to-transparent" style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, white 50%)', backgroundSize: '100% 40px' }}></div>
        </div>

        <div className="flex-1 flex">
          {/* Left Side Controls */}
          <div className="flex-1 flex flex-col p-2 sm:p-4 gap-2 sm:gap-4 border-r border-dashed border-zinc-800">
            <div className="text-center text-zinc-500 font-medium uppercase tracking-widest text-xs sm:text-sm mb-1 sm:mb-2">Left Side</div>
            
            <button
              onClick={() => handleTap('left', 'car')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'left' && lastTap?.type === 'car'
                  ? "border-red-300 bg-red-400 text-white scale-95"
                  : "border-red-600 bg-red-500 text-white active:scale-95 active:bg-red-600 shadow-lg shadow-red-500/20"
              )}
            >
              <Car className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-lg">CAR</span>
            </button>

            <button
              onClick={() => handleTap('left', 'truck')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'left' && lastTap?.type === 'truck'
                  ? "border-orange-300 bg-orange-400 text-white scale-95"
                  : "border-orange-600 bg-orange-500 text-white active:scale-95 active:bg-orange-600 shadow-lg shadow-orange-500/20"
              )}
            >
              <Truck className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-lg">TRUCK</span>
            </button>

            <button
              onClick={() => handleTap('left', 'dumpster')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'left' && lastTap?.type === 'dumpster'
                  ? "border-blue-300 bg-blue-400 text-white scale-95"
                  : "border-blue-600 bg-blue-500 text-white active:scale-95 active:bg-blue-600 shadow-lg shadow-blue-500/20"
              )}
            >
              <Trash2 className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-lg">DUMPSTER</span>
            </button>

            <button
              onClick={() => handleTap('left', 'commercial_truck')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'left' && lastTap?.type === 'commercial_truck'
                  ? "border-purple-300 bg-purple-400 text-white scale-95"
                  : "border-purple-600 bg-purple-500 text-white active:scale-95 active:bg-purple-600 shadow-lg shadow-purple-500/20"
              )}
            >
              <Package className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-sm text-center px-1 leading-tight">COMM.<br/>TRUCK</span>
            </button>
          </div>

          {/* Right Side Controls */}
          <div className="flex-1 flex flex-col p-2 sm:p-4 gap-2 sm:gap-4">
            <div className="text-center text-zinc-500 font-medium uppercase tracking-widest text-xs sm:text-sm mb-1 sm:mb-2">Right Side</div>
            
            <button
              onClick={() => handleTap('right', 'car')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'right' && lastTap?.type === 'car'
                  ? "border-red-300 bg-red-400 text-white scale-95"
                  : "border-red-600 bg-red-500 text-white active:scale-95 active:bg-red-600 shadow-lg shadow-red-500/20"
              )}
            >
              <Car className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-lg">CAR</span>
            </button>

            <button
              onClick={() => handleTap('right', 'truck')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'right' && lastTap?.type === 'truck'
                  ? "border-orange-300 bg-orange-400 text-white scale-95"
                  : "border-orange-600 bg-orange-500 text-white active:scale-95 active:bg-orange-600 shadow-lg shadow-orange-500/20"
              )}
            >
              <Truck className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-lg">TRUCK</span>
            </button>

            <button
              onClick={() => handleTap('right', 'dumpster')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'right' && lastTap?.type === 'dumpster'
                  ? "border-blue-300 bg-blue-400 text-white scale-95"
                  : "border-blue-600 bg-blue-500 text-white active:scale-95 active:bg-blue-600 shadow-lg shadow-blue-500/20"
              )}
            >
              <Trash2 className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-lg">DUMPSTER</span>
            </button>

            <button
              onClick={() => handleTap('right', 'commercial_truck')}
              disabled={!location}
              className={cn(
                "flex-1 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-3 transition-all select-none touch-manipulation",
                !location ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600" :
                lastTap?.side === 'right' && lastTap?.type === 'commercial_truck'
                  ? "border-purple-300 bg-purple-400 text-white scale-95"
                  : "border-purple-600 bg-purple-500 text-white active:scale-95 active:bg-purple-600 shadow-lg shadow-purple-500/20"
              )}
            >
              <Package className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={1.5} />
              <span className="font-bold text-xs sm:text-sm text-center px-1 leading-tight">COMM.<br/>TRUCK</span>
            </button>
          </div>
        </div>
      </main>

      {/* --- Sync Button --- */}
      <div className="bg-zinc-900 border-t border-zinc-800 p-4 shrink-0">
        <button
          onClick={handleSync}
          disabled={isSaving}
          className={cn(
            "w-full font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98]",
            isSaving && "opacity-50 cursor-not-allowed"
          )}
        >
          {isSaving ? "Syncing..." : `Sync ${pendingCounts.length} Pending Count${pendingCounts.length === 1 ? '' : 's'} (Space)`}
        </button>
      </div>
        </>
      ) : viewMode === 'chart' ? (
        <main className="flex-1 flex flex-col p-4 bg-zinc-950 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 flex-1 flex flex-col min-h-[400px]">
            <h2 className="text-xl font-bold text-white mb-6">Vehicle Counts by Side</h2>
            <div className="flex-1 w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#a1a1aa" tick={{fill: '#a1a1aa', fontSize: 12}} axisLine={false} tickLine={false} />
                  <YAxis stroke="#a1a1aa" tick={{fill: '#a1a1aa', fontSize: 12}} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{fill: '#27272a'}} 
                    contentStyle={{backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', borderRadius: '8px'}}
                    itemStyle={{color: '#f4f4f5'}}
                  />
                  <Legend wrapperStyle={{paddingTop: '20px'}} />
                  <Bar dataKey="Left" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Right" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col p-4 bg-zinc-950 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 flex-1 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Data Table</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleShareCSV}
                  disabled={allCounts.length === 0}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800/50 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Mail size={16} />
                  Email / Share
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={allCounts.length === 0}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>
            </div>
            <div className="flex-1 w-full overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-sm">
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Side</th>
                    <th className="py-3 px-4 font-medium">Neighborhood</th>
                    <th className="py-3 px-4 font-medium">Purpose</th>
                    <th className="py-3 px-4 font-medium">GPS Location</th>
                    <th className="py-3 px-4 font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {allCounts.map((count, i) => (
                    <tr key={count.id || i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4 text-zinc-300">
                        {new Date(count.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 text-zinc-300 capitalize">{count.type.replace('_', ' ')}</td>
                      <td className="py-3 px-4 text-zinc-300 capitalize">{count.side}</td>
                      <td className="py-3 px-4 text-zinc-500">{count.neighborhood || '-'}</td>
                      <td className="py-3 px-4 text-zinc-500">{count.purpose || '-'}</td>
                      <td className="py-3 px-4 text-zinc-500 font-mono text-xs">
                        {count.latitude.toFixed(6)}, {count.longitude.toFixed(6)}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">±{Math.round(count.accuracy)}m</td>
                    </tr>
                  ))}
                  {allCounts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500">
                        No counts recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
