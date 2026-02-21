'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { X, MessageSquare, ExternalLink } from 'lucide-react';

// DUMMY DATA
const apps = [
  {
    title: "Amazon Scheduling",
    desc: "Excel scheduling data processor with dynamic filters.",
    icon: "📅",
    href: "/apps/scheduling",
    color: "#00f3ff" // Neon Blue
  },
  {
    title: "Amazon Capacity Compiler",
    desc: "Compile capacity reliability Excel files.",
    icon: "📊",
    href: "/apps/capacity",
    color: "#bc13fe" // Neon Purple
  },
  {
    title: "WST Variable Compiler",
    desc: "Process and compile Service Details & Training reports.",
    icon: "📝",
    href: "https://kitboxpro.vercel.app/wstmerger",
    color: "#0aff10" // Neon Green
  },
  {
    title: "CSV Database",
    desc: "Secure file storage and sharing platform.",
    icon: "☁️",
    href: "#",
    color: "#44475a"
  },
  {
    title: "ADP Payroll",
    desc: "For making Payroll Analysis.",
    icon: "📈",
    href: "#",
    color: "#44475a"
  },
  {
    title: "PDF to Excel",
    desc: "Converts PDF to Excel",
    icon: "🔁",
    href: "/apps/pdftoexcel",
    color: "#00f3ff"
  },
  {
    title: "Amazon Variable Invoice",
    desc: "Convert Variable Amazon Invoice",
    icon: "🔁",
    href: "/apps/variable",
    color: "#bc13fe"
  },
  {
    title: "Amazon Fleet Invoice",
    desc: "Convert Fleet Amazon Invoice",
    icon: "🚚",
    href: "/apps/fleet",
    color: "#fe131f"
  },
];

export default function Home() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => {
      setShowPrompt(true);
    }, 2000);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (showPrompt) {
      const hideTimer = setTimeout(() => {
        setShowPrompt(false);
      }, 5000);
      return () => clearTimeout(hideTimer);
    }
  }, [showPrompt]);

  const handleOpenFeedback = () => {
    setShowPrompt(false);
    setIsModalOpen(true);
  };

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center p-8 overflow-hidden">

      {/* Background Elements - Updated colors to match Nexus Theme */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a1a]" />
        
        {/* Neon Blobs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(0, 243, 255, 0.4) 0%, transparent 70%)' }}
          animate={{ x: [0, 100, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(188, 19, 254, 0.4) 0%, transparent 70%)' }}
          animate={{ x: [0, -50, 0], y: [0, 100, 0], scale: [1, 0.8, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 text-center mb-16">
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter text-white mb-2 drop-shadow-2xl">
            Ztoolx <span className="text-glow text-[var(--neon-blue)]">HUB</span>
          </h1>
          <p className="text-slate-400 tracking-widest uppercase text-sm font-semibold">
            Let me know for more automation apps
          </p>
        </motion.div>
      </div>

      {/* App Grid - Replaced AppCard with custom Link implementation */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {apps.map((app, index) => {
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
              
              {/* Accent Border Bottom */}
              <div 
                className="absolute bottom-0 left-0 w-full h-1 rounded-b-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"
                style={{ background: app.color, boxShadow: `0 0 10px ${app.color}` }} 
              />
            </>
          );

          return (
            <motion.div
              key={app.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              {isExternal ? (
                <a
                  href={app.href}
                  className="glass block p-6 rounded-2xl border border-white/10 hover:border-white/40 transition-all duration-300 group h-full flex flex-col relative overflow-hidden"
                >
                  {CardContent}
                </a>
              ) : (
                <Link
                  href={app.href}
                  className="glass block p-6 rounded-2xl border border-white/10 hover:border-white/40 transition-all duration-300 group h-full flex flex-col relative overflow-hidden"
                >
                  {CardContent}
                </Link>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* HUD Elements */}
      <motion.div
        className="fixed bottom-4 left-4 text-[10px] text-[var(--neon-blue)] font-mono font-semibold z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        <span className="text-[var(--neon-green)]">SYS.STATUS:</span> ONLINE <br/>
        <span className="text-[var(--neon-green)]">MEM.USAGE:</span> 12%
      </motion.div>

      {/* The Floating Action Button */}
      <motion.button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 z-40 glass border border-white/20 text-white p-4 rounded-full shadow-lg hover:border-[var(--neon-purple)] transition-all duration-300"
        whileHover={{ scale: 1.1, boxShadow: "0px 0px 20px rgba(188, 19, 254, 0.6)" }}
        whileTap={{ scale: 0.9 }}
        title="Give Feedback"
      >
        <MessageSquare size={24} className="text-[var(--neon-purple)]" />
      </motion.button>

      {/* The Auto-Pop Prompt */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 50, x: "-50%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-24 left-1/2 z-50 w-auto min-w-[300px] max-w-md"
          >
            <div 
              className="flex items-center justify-between gap-4 glass border border-white/20 text-white px-5 py-3 rounded-lg shadow-2xl cursor-pointer hover:border-white/40 transition-colors group"
              onClick={handleOpenFeedback}
            >
              <div className="flex items-center gap-3">
                <div className="bg-[var(--neon-blue)]/20 p-2 rounded-full text-[var(--neon-blue)]">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm text-white">Feedback</p>
                  <p className="text-xs text-slate-300">Help us improve Ztools HUB</p>
                </div>
              </div>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation(); 
                  setShowPrompt(false);
                }}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Full Feedback Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            
            <motion.div 
              className="relative glass border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl h-[70vh] overflow-hidden flex flex-col"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10 z-10">
                <h3 className="text-lg font-bold text-[var(--neon-blue)] tracking-wide">We value your feedback</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors rounded-full p-1 hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-grow relative">
                <iframe 
                  src="https://docs.google.com/forms/d/e/1FAIpQLSelGY62vpKdMun4yZYgk7K59hX4YHJryWmVCNRaLI0URYVmdQ/viewform?embedded=true" 
                  width="100%" 
                  height="100%" 
                  frameBorder="0" 
                  marginHeight={0} 
                  marginWidth={0}
                  style={{ position: 'absolute', top: 0, left: 0 }}
                >
                  Loading…
                </iframe>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
  );
}
