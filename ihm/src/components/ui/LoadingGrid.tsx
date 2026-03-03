import { motion } from 'framer-motion';

interface Props {
  rows?: number;
  cols?: number;
  message?: string;
}

export function LoadingGrid({ rows = 3, cols = 4, message = 'LOADING…' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => (
          <motion.div
            key={i}
            className="w-8 h-8 border border-cyan-900 rounded"
            animate={{ opacity: [0.1, 0.6, 0.1], borderColor: ['#1A3A5C', '#00D4FF', '#1A3A5C'] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.07,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <p className="font-mono-sc text-xs text-cyan-700 tracking-widest animate-blink">
        {message}
      </p>
    </div>
  );
}
