"use client";
import { motion } from "framer-motion";

/** Remounts on every navigation => a short, GPU-only fade/slide between screens. */
export default function NinjaTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
