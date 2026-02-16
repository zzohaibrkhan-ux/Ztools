'use client';

import { motion, AnimatePresence } from 'framer-motion';
import AppCard from '@/components/AppCard';
import { useState, useEffect } from 'react';
import { X, MessageSquare } from 'lucide-react';

// DUMMY DATA
const apps = [
  {
    title: "Amazon Scheduling",
    desc: "Excel scheduling data processor with dynamic filters.",
    icon: "📅",
    href: "/apps/scheduling",
    color: "#00f3ff"
  },
  {
    title: "Amazon Capacity Compiler",
    desc: "Compile capacity reliability Excel files.",
    icon: "📊",
    href: "/apps/capacity",
    color: "#bc13fe"
  },
  {
    title: "WST Variable Compiler",
    desc: "Process and compile Service Details & Training reports.",
    icon: "📝",
    href: "https://kitboxpro.vercel.app/wstmerger",
    color: "#0aff10"
  },
  {
    title: "CSV Database",
    desc: "Secure file storage and sharing platform.",
    icon: "☁️",
    href: "https://idspcsvinternals.space.z.ai/",
    color: "#44475a"
  },
  {
    title: "ADP Payroll",
    desc: "For making Payroll Analysis.",
    icon: "📈",
    href: "",
    color: "#44475a"
  },
];

export default function Home() {
  // State for the small prompt notification
  const [showPrompt, setShowPrompt] = useState(false);
  // State for the full feedback modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Logic to show prompt after 2s, then hide it after 5s
  useEffect(() => {
    // Show prompt after 2 seconds
    const showTimer = setTimeout(() => {
      setShowPrompt(true);
    }, 2000);

    return () => clearTimeout(showTimer);
  }, []);

  // Separate effect to handle auto-dismissal once prompt is visible
  useEffect(() => {
    if (showPrompt) {
      const hideTimer = setTimeout(() => {
        setShowPrompt(false);
      }, 5000); // Disappear after 5 seconds

      return () => clearTimeout(hideTimer);
    }
  }, [showPrompt]);

  // Function to open modal and hide prompt
  const handleOpenFeedback = () => {
    setShowPrompt(false);
    setIsModalOpen(true);
  };

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center p-8 overflow-hidden">

      {/* Background & Grid (Unchanged) */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a1a]" />
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl"
          animate={{ x: [0, 100, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-600/20 blur-3xl"
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
            Ztools <span className="text-glow">HUB</span>
          </h1>
          <p className="text-gray-400 tracking-widest uppercase text-sm font-semibold">
            Let me know for more automation apps
          </p>
        </motion.div>
      </div>

      {/* App Grid */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {apps.map((app, index) => (
          <motion.div
            key={app.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <AppCard {...app} />
          </motion.div>
        ))}
      </div>

      {/* HUD Elements */}
      <motion.div
        className="fixed bottom-4 left-4 text-[10px] text-cyan-400 font-mono font-semibold z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        <span className="text-green-400">SYS.STATUS:</span> ONLINE <br/>
        <span className="text-green-400">MEM.USAGE:</span> 12%
      </motion.div>

      {/* 1. The Floating Action Button (Permanent) */}
      <motion.button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-full shadow-lg border border-white/20 hover:border-white/60 transition-all duration-300 backdrop-blur-sm"
        whileHover={{ scale: 1.1, boxShadow: "0px 0px 20px rgba(168, 85, 247, 0.6)" }}
        whileTap={{ scale: 0.9 }}
        title="Give Feedback"
      >
        <MessageSquare size={24} />
      </motion.button>

      {/* 2. The Auto-Pop Prompt (Temporary Notification) */}
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
              className="flex items-center justify-between gap-4 bg-white/95 backdrop-blur-md text-gray-900 px-5 py-3 rounded-lg shadow-2xl cursor-pointer border border-gray-200 hover:bg-white transition-colors group"
              onClick={handleOpenFeedback}
            >
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm">Feedback</p>
                  <p className="text-xs text-gray-500">Help us improve Ztools HUB</p>
                </div>
              </div>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent opening the modal
                  setShowPrompt(false);
                }}
                className="text-gray-400 hover:text-gray-800 transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. The Full Feedback Modal (Opens on Click) */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            
            {/* Modal Content */}
            <motion.div 
              className="relative bg-[#0f172a] border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-2xl h-[70vh] overflow-hidden flex flex-col"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f172a]/80 backdrop-blur-md z-10">
                <h3 className="text-lg font-bold text-white tracking-wide">We value your feedback</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors rounded-full p-1 hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* Google Form Iframe */}
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