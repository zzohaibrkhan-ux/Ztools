'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Plug, Code, Zap } from 'lucide-react';
import Link from 'next/link';

export default function APIGateway() {
  return (
    <main className="min-h-screen relative p-8 overflow-hidden bg-gradient-to-br from-[#050510] via-[#0a0a1a] to-[#0f0f2d]">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-6">
          <ArrowLeft size={20} />
          Back to Hub
        </Link>

        <div className="text-center py-20">
          <div className="p-6 rounded-xl bg-cyan-500/20 inline-flex mb-6">
            <Plug size={64} className="text-cyan-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">API Gateway</h1>
          <p className="text-gray-400 mb-8">RESTful API management and testing</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="glass rounded-xl p-6">
              <Code className="text-cyan-400 mb-4" size={32} />
              <div className="text-2xl font-bold text-white">45</div>
              <div className="text-gray-400">APIs</div>
            </div>
            <div className="glass rounded-xl p-6">
              <Zap className="text-yellow-400 mb-4" size={32} />
              <div className="text-2xl font-bold text-white">2.3M</div>
              <div className="text-gray-400">Requests/Day</div>
            </div>
            <div className="glass rounded-xl p-6">
              <Plug className="text-green-400 mb-4" size={32} />
              <div className="text-2xl font-bold text-white">99.9%</div>
              <div className="text-gray-400">Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
