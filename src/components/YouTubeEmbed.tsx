import { youtubeEmbedUrl } from '@/lib/trainerExerciseValidation'

export default function YouTubeEmbed({
  url,
  title,
}: {
  url: string | null | undefined
  title: string
}) {
  const src = youtubeEmbedUrl(url)
  if (!src) return null

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-950 shadow-sm">
      <iframe
        src={src}
        title={`${title} video explanation`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="aspect-video w-full border-0"
      />
    </div>
  )
}
