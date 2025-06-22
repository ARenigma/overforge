interface DotGridBackgroundProps {
  className?: string
  opacity?: number
}

export function DotGridBackground({ className = "", opacity = 50 }: DotGridBackgroundProps) {
  return (
    <div 
      className={`absolute inset-0 z-0 pointer-events-none ${className}`}
      style={{
        opacity: opacity / 100,
        backgroundImage: `radial-gradient(circle, #9ca3af 2px, transparent 2px)`,
        backgroundSize: '80px 80px',
        backgroundPosition: 'center center',
        maskImage: 'radial-gradient(ellipse 80% 65% at center, black 50%, rgba(0,0,0,0.8) 70%, rgba(0,0,0,0.4) 85%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 65% at center, black 50%, rgba(0,0,0,0.8) 70%, rgba(0,0,0,0.4) 85%, transparent 100%)'
      }}
    />
  )
} 