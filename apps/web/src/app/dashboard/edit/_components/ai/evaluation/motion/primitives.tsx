'use client';

// Adapted from Magic UI BorderBeam / AnimatedListItem and Motion Primitives
// AnimatedNumber (MIT). Sources and full license notices: THIRD_PARTY_LICENSES.txt.
import { useEffect } from 'react';
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import type { ReactNode } from 'react';
import styles from '../evaluation.module.css';

export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const spring = useSpring(reduce ? value : 0, {
    stiffness: 95,
    damping: 24,
    restDelta: 0.2,
  });
  const display = useTransform(spring, (latest) =>
    Math.round(latest).toString(),
  );
  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [spring, value, reduce]);
  return (
    <>
      <span className={styles.srOnly}>{value}</span>
      <motion.span aria-hidden="true">{display}</motion.span>
    </>
  );
}

export function BorderBeam() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className={styles.borderBeam} aria-hidden="true">
      <motion.i
        style={{ offsetPath: 'rect(0 auto auto 0 round 10px)' }}
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: '100%' }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

export function FindingEntry({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
  'data-open'?: boolean;
  'data-issue-id'?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      {...props}
      className={className}
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, x: 18, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ type: 'spring', stiffness: 350, damping: 35 }}
    >
      {children}
    </motion.article>
  );
}
