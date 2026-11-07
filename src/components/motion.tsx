import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
const DURATION = 0.5;

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION, ease: EASE } },
};

const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION, ease: EASE } },
};

type FadeInProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "header" | "footer" | "p" | "span";
  flat?: boolean;
  delay?: number;
  id?: string;
  style?: React.CSSProperties;
};

export function FadeIn({ children, className, as = "div", flat = false, delay, ...rest }: FadeInProps) {
  const Component = motion[as];
  const variants = flat ? fadeVariants : fadeUpVariants;

  return (
    <Component
      variants={delay ? undefined : variants}
      initial={delay ? (flat ? { opacity: 0 } : { opacity: 0, y: 20 }) : "hidden"}
      whileInView={delay ? (flat ? { opacity: 1 } : { opacity: 1, y: 0 }) : "visible"}
      viewport={{ once: true, margin: "-60px" }}
      transition={delay ? { duration: DURATION, ease: EASE, delay } : undefined}
      className={className}
      {...rest}
    >
      {children}
    </Component>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  faster?: boolean;
  id?: string;
  style?: React.CSSProperties;
};

export function Stagger({ children, className, faster, ...rest }: StaggerProps) {
  const variants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: faster ? 0.06 : 0.1 } },
  };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, flat = false }: { children: ReactNode; className?: string; flat?: boolean }) {
  return (
    <motion.div
      variants={flat ? fadeVariants : fadeUpVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { fadeUpVariants, fadeVariants };
