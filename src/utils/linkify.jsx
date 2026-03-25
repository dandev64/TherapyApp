import { ExternalLink, Play } from 'lucide-react'

const URL_REGEX = /(https?:\/\/[^\s]+)/

function isYouTubeUrl(url) {
  return url.includes('youtube.com') || url.includes('youtu.be')
}

export function Linkify({ text, className = '' }) {
  if (!text) return null
  const parts = text.split(URL_REGEX)

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part && part.match(URL_REGEX)) {
          if (isYouTubeUrl(part)) {
            return (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-danger text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity no-underline"
              >
                <Play size={12} /> Watch on YouTube
              </a>
            )
          }
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline break-all"
            >
              {part} <ExternalLink size={12} />
            </a>
          )
        }
        return part
      })}
    </span>
  )
}
