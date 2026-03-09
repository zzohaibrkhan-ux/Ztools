'use client';

import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useVelocity } from 'framer-motion';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { X, MessageSquare, ExternalLink, Search } from 'lucide-react';

// DUMMY DATA
const apps = [
  { title: "Amazon Scheduling", desc: "Excel scheduling data processor with dynamic filters.", icon: "📅", href: "/apps/scheduling", color: "#00f3ff" },
  { title: "Amazon Capacity Compiler", desc: "Compile capacity reliability Excel files.", icon: "📊", href: "/apps/capacity", color: "#bc13fe" },
  { title: "WST Variable Compiler", desc: "Process and compile Service Details & Training reports.", icon: "📝", href: "https://kitboxpro.vercel.app/wstmerger", color: "#0aff10" },
  { title: "CSV Database", desc: "Secure file storage and sharing platform.", icon: "☁️", href: "#", color: "#44475a" },
  { title: "ADP Payroll", desc: "For making Payroll Analysis.", icon: "📈", href: "#", color: "#44475a" },
  { title: "PDF to Excel", desc: "Converts PDF to Excel", icon: "🔁", href: "/apps/pdftoexcel", color: "#00f3ff" },
  { title: "Amazon Variable Invoice", desc: "Convert Variable Amazon Invoice", icon: "🔁", href: "/apps/variable", color: "#bc13fe" },
  { title: "Amazon Fleet Invoice", desc: "Convert Fleet Amazon Invoice", icon: "🚚", href: "/apps/fleet", color: "#fe131f" },
  { title: "Amazon Scorecard", desc: "Generate Amazon Scorecards", icon: "🔢", href: "/apps/scorecard", color: "#fe13ea" },
  { title: "Amazon Training Report", desc: "Generate Amazon Training Reports", icon: "🎓", href: "/apps/training", color: "#1336fe" },
];

// --- NEON FISH COMPONENT (Supports Video, Image/GIF, Emoji) ---
const NeonFish = ({ mouse_x, mouse_y, stiffness, damping, scale, color, emoji, img, video, offset }) => {
  
  // 1. Target Position
  const targetX = useTransform(mouse_x, (v) => v + offset.x);
  const targetY = useTransform(mouse_y, (v) => v + offset.y);

  // 2. Physics
  const x = useSpring(targetX, { stiffness: stiffness, damping: damping });
  const y = useSpring(targetY, { stiffness: stiffness, damping: damping });

  // 3. Rotation
  const velocityX = useVelocity(x);
  const velocityY = useVelocity(y);
  
  const rotation = useTransform(
    [velocityX, velocityY], 
    ([vx, vy]) => {
      const speed = Math.sqrt(vx*vx + vy*vy);
      if (speed < 0.5) return 0; 
      return Math.atan2(vy, vx) * (180 / Math.PI);
    }
  );

  // Common styles for the media container (Glow + Flip)
  const mediaStyle = {
    transform: 'scaleX(-1)', // Flip to face direction of movement
    filter: `drop-shadow(0px 0px 8px ${color})`,
  };

  return (
    <motion.div
      className="absolute top-0 left-0 pointer-events-none select-none z-10"
      style={{
        x,
        y,
        rotate: rotation,
        scale: scale,
        translateX: "-50%",
        translateY: "-50%",
      }}
    >
      {/* Logic: Video -> Image (GIF) -> Emoji */}
      
      {video ? (
        // VIDEO RENDER
        <video 
          src={video} 
          autoPlay 
          loop 
          muted 
          playsInline
          className="w-16 h-16 object-contain" 
          style={mediaStyle}
        />
      ) : img ? (
        // IMAGE / GIF RENDER
        <img 
          src={img} 
          alt="fish" 
          className="w-12 h-12 object-contain" 
          style={mediaStyle}
        />
      ) : (
        // EMOJI RENDER
        <div 
          className="text-5xl"
          style={{ 
            ...mediaStyle,
            display: 'inline-block'
          }}
        >
          {emoji || "🐟"}
        </div>
      )}
    </motion.div>
  );
};


export default function Home() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  // --- CONFIGURATION ---
  // You can use `video`, `img` (works for static images and GIFs), or `emoji`.
  const school = [
    // 1. Example: VIDEO (MP4/WebM)
    { 
      img: "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/c5ae195f-e639-4f3e-87e0-6199d10d2fb9/dgjt6vo-60774a38-a334-4c85-80ee-4881c1afa829.gif?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiIvZi9jNWFlMTk1Zi1lNjM5LTRmM2UtODdlMC02MTk5ZDEwZDJmYjkvZGdqdDZ2by02MDc3NGEzOC1hMzM0LTRjODUtODBlZS00ODgxYzFhZmE4MjkuZ2lmIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.qpRy477x1aO6Hxopkc6_HoaTO0VHf07ke1SxAvovHYo", // Example underwater video clip
      color: "#00f3ff", stiffness: 200, damping: 50, scale: 0.6, offset: {x: -40, y: 0} // Scale adjusted for video size
    },
    
    // 2. Example: GIF (Uses `img` prop)
    { 
      img: "https://media0.giphy.com/media/v1.Y2lkPTZjMDliOTUyeDlhb3V6c3ZpeWNkc3N0cmtnN2kxc3E3OWNtM24wOXkxNnBvcmV3bCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/XN8YOV0H6YfVFFGxth/giphy-downsized.gif", // Example Fish GIF
      color: "#bc13fe", stiffness: 180, damping: 20, scale: 1.2, offset: {x: -80, y: -50} 
    },
    
    // 3. Example: Regular Image (PNG)
    { 
      img: "https://media.tenor.com/mtiOW6O-k8YAAAAM/shrek-shrek-rizz.gif", 
      color: "#0aff10", stiffness: 150, damping: 15, scale: 1.1, offset: {x: -80, y: 50} 
    },
    
    // 4. Example: Emoji
    { 
      img: "https://media.tenor.com/Faed-yR29P8AAAAM/huh-ew.gif", 
      color: "#fe13ea", stiffness: 120, damping: 12, scale: 1.0, offset: {x: -160, y: 0} 
    },
  ];

  useEffect(() => {
    const showTimer = setTimeout(() => setShowPrompt(true), 2000);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (showPrompt) {
      const hideTimer = setTimeout(() => setShowPrompt(false), 5000);
      return () => clearTimeout(hideTimer);
    }
  }, [showPrompt]);

  const handleOpenFeedback = () => {
    setShowPrompt(false);
    setIsModalOpen(true);
  };

  const filteredApps = apps.filter((app) =>
    app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main 
      className="min-h-screen relative flex flex-col items-center justify-center p-8 overflow-hidden bg-[#0a0a1a]"
      onMouseMove={handleMouseMove}
    >
      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* --- THE SCHOOL --- */}
      <div className="fixed inset-0 z-10 pointer-events-none">
        {school.map((fish, index) => (
          <NeonFish 
            key={index}
            mouse_x={mouseX}
            mouse_y={mouseY}
            stiffness={fish.stiffness}
            damping={fish.damping}
            scale={fish.scale}
            color={fish.color}
            emoji={fish.emoji}
            img={fish.img}
            video={fish.video} // Pass video prop
            offset={fish.offset}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-20 w-full flex flex-col items-center">
        
        {/* Header */}
        <div className="relative text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
          >
            <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter text-white mb-2 drop-shadow-2xl">
              Ztoolx <span className="text-glow text-[var(--neon-blue)]">HUB</span>
            </h1>
            <p className="text-slate-400 tracking-widest uppercase text-sm font-semibold">
              Automation & Tools
            </p>
          </motion.div>
        </div>

        {/* Search */}
        <motion.div 
          className="relative w-full max-w-2xl mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div className="glass flex items-center gap-3 px-5 py-3.5 rounded-xl border border-white/10 hover:border-white/20 focus-within:border-[var(--neon-blue)] transition-all duration-300 shadow-lg backdrop-blur-md bg-white/5">
            <Search size={20} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent w-full outline-none text-white placeholder-slate-500 text-sm tracking-wide"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                <X size={16} />
              </button>
            )}
          </div>
        </motion.div>

        {/* Grid */}
        <motion.div layout className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
          <AnimatePresence>
            {filteredApps.length > 0 ? (
              filteredApps.map((app) => {
                const isExternal = app.href.startsWith('http');
                const CardContent = (
                  <>
                    <div className="text-4xl mb-4">{app.icon}</div>
                    <h3 className="text-xl font-bold text-white mb-2">{app.title}</h3>
                    <p className="text-slate-400 text-sm mb-4 flex-grow">{app.desc}</p>
                    <div className="flex items-center gap-2 text-sm font-medium mt-auto" style={{ color: app.color }}>
                      <span>Open App</span>
                      {isExternal && <ExternalLink size={14} />}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-1 rounded-b-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" style={{ background: app.color, boxShadow: `0 0 10px ${app.color}` }} />
                  </>
                );

                return (
                  <motion.div key={app.title} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.3 }}>
                    {isExternal ? (
                      <a href={app.href} className="glass block p-6 rounded-2xl border border-white/10 hover:border-white/40 transition-all duration-300 group h-full flex flex-col relative overflow-hidden backdrop-blur-md bg-white/5">{CardContent}</a>
                    ) : (
                      <Link href={app.href} className="glass block p-6 rounded-2xl border border-white/10 hover:border-white/40 transition-all duration-300 group h-full flex flex-col relative overflow-hidden backdrop-blur-md bg-white/5">{CardContent}</Link>
                    )}
                  </motion.div>
                );
              })
            ) : (
              <motion.div className="col-span-full text-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-slate-400 text-lg">No apps found</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* FAB */}
      <motion.button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 z-50 glass border border-white/20 text-white p-4 rounded-full shadow-lg hover:border-[var(--neon-purple)] transition-all duration-300 backdrop-blur-md bg-white/5"
        whileHover={{ scale: 1.1, boxShadow: "0px 0px 20px rgba(188, 19, 254, 0.6)" }}
        whileTap={{ scale: 0.9 }}
      >
        <MessageSquare size={24} className="text-[var(--neon-purple)]" />
      </motion.button>

      {/* Modals */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 50, x: "-50%" }}
            className="fixed bottom-24 left-1/2 z-50 w-auto"
          >
            <div className="glass border border-white/20 px-5 py-3 rounded-lg cursor-pointer backdrop-blur-md" onClick={handleOpenFeedback}>
              <p className="text-white font-bold">Feedback?</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            <motion.div className="relative glass border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl h-[70vh] overflow-hidden flex flex-col z-10 backdrop-blur-md bg-black/50" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <iframe src="https://docs.google.com/forms/d/e/1FAIpQLSelGY62vpKdMun4yZYgk7K59hX4YHJryWmVCNRaLI0URYVmdQ/viewform?embedded=true" width="100%" height="100%" frameBorder="0">Loading…</iframe>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}