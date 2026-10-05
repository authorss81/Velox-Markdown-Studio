import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number;
}

export const AppLogo: React.FC<AppLogoProps> = ({ className = 'w-6 h-6', size = 24 }) => {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Dynamic Fluent 3D Background Gradient */}
        <radialGradient
          id="fluent-radial"
          cx="30%"
          cy="20%"
          r="80%"
          fx="30%"
          fy="20%"
        >
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="35%" stopColor="#0284C7" />
          <stop offset="70%" stopColor="#0369A1" />
          <stop offset="100%" stopColor="#0B132B" />
        </radialGradient>

        <linearGradient id="fluent-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0284C7" stopOpacity="0.1" />
        </linearGradient>

        <linearGradient id="doc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>

        <linearGradient id="fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0369A1" />
          <stop offset="100%" stopColor="#082F49" />
        </linearGradient>

        <linearGradient id="ribbon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00D2FF" />
          <stop offset="50%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>

        <filter id="card-shadow" x="-15%" y="-15%" width="130%" height="135%">
          <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#00182C" floodOpacity="0.45" />
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0284C7" floodOpacity="0.25" />
        </filter>

        <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38BDF8" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* Main Base Squircle with Mica lighting */}
      <rect width="512" height="512" rx="116" fill="url(#fluent-radial)" />
      <rect
        x="3"
        y="3"
        width="506"
        height="506"
        rx="113"
        fill="none"
        stroke="url(#fluent-border)"
        strokeWidth="5"
      />

      {/* Paper Document with 3D drop shadow */}
      <g filter="url(#card-shadow)">
        <path
          d="M 124 92 L 316 92 L 396 172 L 396 420 C 396 433.255 385.255 444 372 444 L 148 444 C 134.745 444 124 433.255 124 420 Z"
          fill="url(#doc-gradient)"
        />
        {/* Fold Corner */}
        <path
          d="M 316 92 L 316 164 C 316 168.418 319.582 172 324 172 L 396 172 Z"
          fill="url(#fold-grad)"
        />
      </g>

      {/* Modern Markdown Emblem Shield */}
      <g filter="url(#neon-glow)">
        <rect x="154" y="206" width="204" height="136" rx="20" fill="url(#ribbon-grad)" />
        <rect
          x="154"
          y="206"
          width="204"
          height="136"
          rx="20"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeOpacity="0.5"
        />

        {/* Dynamic 'M' Letterform */}
        <path
          d="M 182 308 L 182 240 L 206 274 L 230 240 L 230 308"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Markdown Direction Arrow */}
        <path
          d="M 288 240 L 288 308 M 266 286 L 288 308 L 310 286"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Document Content Lines */}
      <rect x="156" y="364" width="200" height="12" rx="6" fill="#94A3B8" fillOpacity="0.8" />
      <rect x="156" y="388" width="135" height="10" rx="5" fill="#CBD5E1" fillOpacity="0.8" />

      {/* Windows 11 Accent Gem */}
      <circle cx="340" cy="393" r="8" fill="#38BDF8" filter="url(#neon-glow)" />
    </svg>
  );
};
