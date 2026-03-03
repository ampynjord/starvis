import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
      >
        <div className="relative w-32 h-32 mx-auto">
          <div className="absolute inset-0 border-4 border-red-900 rounded-full animate-ping opacity-20" />
          <div className="absolute inset-0 flex items-center justify-center border-2 border-red-800 rounded-full">
            <span className="font-orbitron text-4xl font-black text-red-500">404</span>
          </div>
        </div>
      </motion.div>

      <div>
        <p className="font-orbitron text-xl text-slate-400 tracking-widest uppercase">Secteur inconnu</p>
        <p className="text-slate-600 text-sm mt-2">La page que vous recherchez n'existe pas dans cette quadrille.</p>
      </div>

      <Link to="/" className="sci-btn-primary">
        ← Retour à la base
      </Link>
    </div>
  );
}
