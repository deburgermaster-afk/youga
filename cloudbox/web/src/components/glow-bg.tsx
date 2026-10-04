// Dark background with soft, slowly pulsing orange light.
// Sized to the full screen (large viewport + safe areas) so nothing shows
// through under the status bar or the iPhone home indicator.
export function GlowBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[calc(-1*env(safe-area-inset-top))] -z-10 h-[calc(100lvh+env(safe-area-inset-top)+env(safe-area-inset-bottom))] overflow-hidden bg-[#07070a]">
      <div className="glow-a absolute will-change-transform -top-1/4 -left-1/4 size-[85vmax] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.32),transparent_60%)] blur-3xl" />
      <div className="glow-b absolute will-change-transform -right-1/3 -bottom-1/3 size-[75vmax] rounded-full bg-[radial-gradient(circle,rgba(234,88,12,0.22),transparent_60%)] blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(7,7,10,0.85)_100%)]" />
    </div>
  )
}
