'use client';

import { Phone } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  sessionId: string;
  disabled: boolean;
}

export default function CallButton({ sessionId, disabled }: Props) {
  const [calling, setCalling] = useState(false);
  
  const handleCall = async () => {
    setCalling(true);
    
    try {
      const response = await fetch('/api/voice/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Call initiated! You'll receive a call at ${data.phoneNumber} shortly.`);
      } else {
        alert('Failed to initiate call. Please try again.');
      }
    } catch (error) {
      alert('Error initiating call');
    } finally {
      setCalling(false);
    }
  };
  
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleCall}
      disabled={disabled || calling}
      className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
        disabled || calling
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg'
      }`}
    >
      <Phone className="w-5 h-5" />
      {calling ? 'Calling...' : 'Switch to Phone Call'}
    </motion.button>
  );
}