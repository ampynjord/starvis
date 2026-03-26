import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  className?: string;
  to?: string;
  onClick?: () => void;
}

export function HoloCard({ children, className = '', to, onClick }: Props) {
  const cls = `holo-card p-4 ${className}`;
  const inner = <>{children}</>;

  if (to) return (
    <Link href={to} className={cls}>
      <motion.div whileHover={{ scale: 1.01 }} transition={{ duration: 0.15 }}>
        {inner}
      </motion.div>
    </Link>
  );

  return (
    <motion.div
      className={cls}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
    >
      {inner}
    </motion.div>
  );
}
