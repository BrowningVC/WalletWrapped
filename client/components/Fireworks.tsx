'use client';

import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
  decay: number;
}

interface Firework {
  id: number;
  x: number;
  y: number;
  particles: Particle[];
  startTime: number;
}

interface Sparkle {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
}

const COLORS = ['#ffd700', '#ff6b9d', '#00ff88', '#667eea', '#764ba2', '#ff8c00', '#4cc9f0'];

export default function Fireworks() {
  const [fireworks, setFireworks] = useState<Firework[]>([]);
  const [staticSparkles, setStaticSparkles] = useState<Sparkle[]>([]);
  const [mounted, setMounted] = useState(false);

  // Generate sparkle positions only on client-side to avoid hydration mismatch
  useEffect(() => {
    setStaticSparkles(
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 2,
      }))
    );
    setMounted(true);
  }, []);

  useEffect(() => {
    const createFirework = () => {
      const x = 10 + Math.random() * 80; // 10-90% of screen width
      const y = 10 + Math.random() * 40; // 10-50% of screen height (upper area)
      const particleCount = 12 + Math.floor(Math.random() * 8);
      const baseColor = COLORS[Math.floor(Math.random() * COLORS.length)];

      const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
        id: i,
        x: 0,
        y: 0,
        color: i % 3 === 0 ? '#ffd700' : baseColor,
        size: 2 + Math.random() * 3,
        angle: (i / particleCount) * Math.PI * 2,
        speed: 2 + Math.random() * 3,
        decay: 0.95 + Math.random() * 0.03,
      }));

      const newFirework: Firework = {
        id: Date.now() + Math.random(),
        x,
        y,
        particles,
        startTime: Date.now(),
      };

      setFireworks(prev => [...prev, newFirework]);

      // Remove firework after animation
      setTimeout(() => {
        setFireworks(prev => prev.filter(f => f.id !== newFirework.id));
      }, 2000);
    };

    // Create fireworks at random intervals - more frequent
    const interval = setInterval(() => {
      createFirework();
      // Sometimes create a second firework for bursts
      if (Math.random() > 0.5) {
        setTimeout(createFirework, 200);
      }
    }, 800);

    // Initial fireworks burst
    setTimeout(createFirework, 300);
    setTimeout(createFirework, 600);

    return () => clearInterval(interval);
  }, []);

  // Don't render anything until client-side mounted to prevent hydration mismatch
  if (!mounted) {
    return <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }} />;
  }

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {/* Static twinkling stars */}
      {staticSparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${sparkle.left}%`,
            top: `${sparkle.top}%`,
            width: sparkle.size,
            height: sparkle.size,
            animation: `twinkle ${sparkle.duration}s ease-in-out ${sparkle.delay}s infinite`,
          }}
        />
      ))}

      {/* Firework bursts */}
      {fireworks.map(firework => (
        <div
          key={firework.id}
          className="absolute"
          style={{
            left: `${firework.x}%`,
            top: `${firework.y}%`,
          }}
        >
          {firework.particles.map(particle => (
            <div
              key={particle.id}
              className="absolute rounded-full"
              style={{
                backgroundColor: particle.color,
                width: particle.size,
                height: particle.size,
                boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
                animation: `firework-particle 1.5s ease-out forwards`,
                '--angle': `${particle.angle}rad`,
                '--speed': particle.speed,
              } as React.CSSProperties}
            />
          ))}
          {/* Center flash */}
          <div
            className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{
              boxShadow: '0 0 20px #fff, 0 0 40px #ffd700',
              animation: 'firework-flash 0.3s ease-out forwards',
            }}
          />
        </div>
      ))}
    </div>
  );
}
