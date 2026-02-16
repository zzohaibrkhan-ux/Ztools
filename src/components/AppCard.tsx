'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ExternalLink, ChevronRight } from 'lucide-react';

interface AppCardProps {
  title: string;
  description: string;
  icon: string;
  href: string;
  color: string;
}

export default function AppCard({ title, description, icon, href, color }: AppCardProps) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation intensity
    const rotateXVal = ((y - centerY) / centerY) * -10;
    const rotateYVal = ((x - centerX) / centerX) * 10;

    setRotateX(rotateXVal);
    setRotateY(rotateYVal);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block p-[1px] rounded-2xl overflow-visible cursor-pointer group"
      style={{ perspective: 1000 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Neon Border Gradient */}
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm z-0"
        style={{ background: `linear-gradient(135deg, ${color}, transparent, ${color})` }}
      />

      <motion.div
        className="glass rounded-2xl p-6 h-full relative z-10 overflow-hidden"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Background Scan Line Effect */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity"
          style={{
            background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${color} 2px, ${color} 4px)`
          }}
        />

        <div className="flex justify-between items-start mb-4">
          <div className="text-4xl">{icon}</div>
          <div className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
            <ExternalLink size={16} className="text-white/50 group-hover:text-white transition-colors" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 text-shadow">
          {title}
        </h3>
        <p className="text-gray-300 text-sm mb-6 font-normal leading-relaxed">
          {description}
        </p>

        <div className="absolute bottom-4 right-4 flex items-center gap-1 text-xs uppercase tracking-widest text-cyan-300 group-hover:text-cyan-200 transition-colors font-semibold">
          Launch <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </div>
      </motion.div>
    </motion.a>
  );
}
